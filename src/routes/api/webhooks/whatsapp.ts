import crypto from "node:crypto";
import { eventHandler, getHeader, readBody, setResponseStatus, createError } from "h3";
import { getDb } from "@/lib/db.server";
import { logger, EVENTS } from "@/lib/logger.server";
import { recordInteraction, containsPessimisticKeyword } from "@/lib/api/interactions.server";
import { getCustomKeywords } from "@/lib/api/clinic-config.server";
import { storeFile } from "@/lib/storage.server";
import { publishEvent } from "@/lib/event-bus.server";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf-8")
    .digest("hex");
  const prefix = "sha256=";
  if (!signature.startsWith(prefix)) return false;
  const sig = signature.slice(prefix.length);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

async function findLeadByPhone(
  orgId: string,
  phone: string,
): Promise<{ id: number; name: string; status: string } | null> {
  const db = await getDb();
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const rows = await db.unsafe<Array<{ id: number; name: string; status: string }>>(
    `SELECT id, name, status FROM clinic_leads
     WHERE organization_id = $1
       AND REPLACE(REPLACE(phone, ' ', ''), '+', '') LIKE $2
     LIMIT 1`,
    [orgId, `%${cleanPhone.slice(-9)}`],
  );
  return rows.length > 0 ? rows[0] : null;
}

const MEDIA_TYPES = new Set(["image", "document", "audio", "video", "sticker"]);

interface MediaInfo {
  type: string;
  mediaId: string;
  mimeType: string;
  caption: string;
  filename: string;
}

function extractMedia(msg: Record<string, unknown>): MediaInfo | null {
  for (const mediaType of MEDIA_TYPES) {
    const mediaField = msg[mediaType] as Record<string, unknown> | undefined;
    if (mediaField) {
      return {
        type: mediaType,
        mediaId: (mediaField.id as string) || "",
        mimeType: (mediaField.mime_type as string) || "application/octet-stream",
        caption: (mediaField.caption as string) || "",
        filename: (mediaField.filename as string) || `${mediaType}_${Date.now()}`,
      };
    }
  }
  return null;
}

async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { url?: string } | null;
    if (!data?.url) return null;
    const mediaResp = await fetch(data.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!mediaResp.ok) return null;
    const buffer = Buffer.from(await mediaResp.arrayBuffer());
    return buffer;
  } catch {
    return null;
  }
}

async function lookupOrgFromPhone(phone: string): Promise<string | null> {
  const db = await getDb();
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  const rows = await db.unsafe<Array<{ organization_id: string }>>(
    `SELECT DISTINCT cl.organization_id FROM clinic_leads cl
     WHERE REPLACE(REPLACE(cl.phone, ' ', ''), '+', '') LIKE $1
     LIMIT 1`,
    [`%${cleanPhone.slice(-9)}`],
  );
  return rows.length > 0 ? rows[0].organization_id : null;
}

export const GET = eventHandler(async (event) => {
  const url = new URL(event.path || "/", `http://${getHeader(event, "host") || "localhost"}`);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = url.searchParams.get("hub.verify_token");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || "kwc_webhook_2026";

  if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
    logger.info("WhatsApp webhook verified", { event: EVENTS.WHATSAPP_INBOUND });
    setResponseStatus(event, 200);
    return challenge;
  }

  logger.warn("WhatsApp webhook verification failed", { event: EVENTS.WHATSAPP_FAILED });
  throw createError({ statusCode: 403, statusMessage: "Verification failed" });
});

export const POST = eventHandler(async (event) => {
  const signature = getHeader(event, "x-hub-signature-256") || "";
  const rawBody = await readBody(event, { encoding: "utf-8" });

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret && !verifySignature(rawBody, signature, appSecret)) {
    logger.warn("WhatsApp webhook signature invalid", {
      event: EVENTS.WHATSAPP_FAILED,
    });
    throw createError({ statusCode: 403, statusMessage: "Invalid signature" });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody as Record<string, unknown>;
  } catch {
    throw createError({ statusCode: 400, statusMessage: "Invalid JSON" });
  }

  const entries = body?.entry as Array<Record<string, unknown>> | undefined;
  if (!entries) {
    setResponseStatus(event, 200);
    return "OK";
  }

  let processedCount = 0;

  for (const entry of entries) {
    const changes = entry?.changes as Array<Record<string, unknown>> | undefined;
    if (!changes) continue;

    for (const change of changes) {
      const value = change?.value as Record<string, unknown> | undefined;
      if (!value) continue;

      const messages = value?.messages as Array<Record<string, unknown>> | undefined;
      if (!messages) continue;

      for (const msg of messages) {
        const from = msg?.from as string | undefined;
        if (!from) continue;

        const msgType = (msg?.type as string) || "text";
        const text = ((msg?.text as Record<string, unknown> | undefined)?.body as string | undefined) || "";
        const mediaInfo = extractMedia(msg);

        if (msgType === "text" && !text) continue;

        const orgId = await lookupOrgFromPhone(from);
        if (!orgId) {
          logger.info("WhatsApp inbound from unknown number", {
            event: EVENTS.WHATSAPP_INBOUND,
            phone: from.slice(0, 6) + "****",
          });
          continue;
        }

        const lead = await findLeadByPhone(orgId, from);
        const leadId = lead?.id ?? 0;
        const metadata: Record<string, unknown> = {
          phone: from,
          direction: "inbound",
          msgType,
        };

        let storedFile: { path: string; originalName: string } | null = null;

        if (mediaInfo) {
          metadata.mediaType = mediaInfo.type;
          metadata.mimeType = mediaInfo.mimeType;
          metadata.caption = mediaInfo.caption.slice(0, 500);
          metadata.mediaId = mediaInfo.mediaId;

          const mediaBuffer = await downloadWhatsAppMedia(mediaInfo.mediaId);
          if (mediaBuffer) {
            try {
              storedFile = await storeFile(orgId, mediaInfo.type === "document" ? "document" : "image", mediaInfo.filename, mediaBuffer);
              metadata.storedPath = storedFile.path;
            } catch {
              metadata.storeFailed = true;
            }
          }

          await recordInteraction(orgId, leadId, "media_shared", metadata);

          if (mediaInfo.caption && lead) {
            const captionText = mediaInfo.caption;
            const customKeywords = await getCustomKeywords(orgId);
            const isCancellation = containsPessimisticKeyword(captionText) ||
              customKeywords.some((kw) => captionText.toLowerCase().includes(kw.toLowerCase()));
            if (isCancellation) {
              await recordInteraction(orgId, lead.id, "cancellation_alert", {
                phone: from,
                message: captionText.slice(0, 500),
                previous_status: lead.status,
              });
              logger.info("Cancellation alert via media caption", {
                event: EVENTS.LEAD_FLAGGED,
                leadId: lead.id,
              });
            }
          }
        } else {
          metadata.message = text.slice(0, 500);

          if (lead) {
            metadata.lead_id = lead.id;
            metadata.lead_name = lead.name;

            await recordInteraction(orgId, lead.id, "message_received", {
              phone: from,
              message: text.slice(0, 500),
            });

            const customKeywords = await getCustomKeywords(orgId);
            const allKeywords = [...customKeywords];
            const isCancellation = containsPessimisticKeyword(text) ||
              allKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));

            if (isCancellation) {
              await recordInteraction(orgId, lead.id, "cancellation_alert", {
                phone: from,
                message: text.slice(0, 500),
                previous_status: lead.status,
              });
              logger.info("Cancellation alert recorded", {
                event: EVENTS.LEAD_FLAGGED,
                leadId: lead.id,
              });
            }
          } else {
            await recordInteraction(orgId, 0, "message_received", metadata);
          }
        }

        if (orgId) {
          publishEvent(orgId, "interaction:created", {
            leadId: leadId,
            eventType: mediaInfo ? "media_shared" : "message_received",
            from: from.slice(0, 6) + "****",
          }).catch(() => {});
        }

        processedCount++;
        logger.info("WhatsApp inbound processed", {
          event: EVENTS.WHATSAPP_INBOUND,
          matched: !!lead,
          leadId: lead?.id,
          msgType,
        });
      }
    }
  }

  logger.info("WhatsApp webhook processed", {
    event: EVENTS.WHATSAPP_INBOUND,
    processed: processedCount,
  });

  setResponseStatus(event, 200);
  return "OK";
});
