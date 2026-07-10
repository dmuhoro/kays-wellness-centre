import crypto from "node:crypto";
import { eventHandler, getHeader, readBody, setResponseStatus, createError } from "h3";
import { getDb } from "@/lib/db.server";
import { logger, EVENTS } from "@/lib/logger.server";
import { recordInteraction, containsPessimisticKeyword } from "@/lib/api/interactions.server";

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
        const text = ((msg?.text as Record<string, unknown> | undefined)?.body as string | undefined) || "";

        if (!from || !text) continue;

        const orgId = await lookupOrgFromPhone(from);
        if (!orgId) {
          logger.info("WhatsApp inbound from unknown number", {
            event: EVENTS.WHATSAPP_INBOUND,
            phone: from.slice(0, 6) + "****",
          });
          continue;
        }

        const lead = await findLeadByPhone(orgId, from);
        const metadata: Record<string, unknown> = {
          phone: from,
          message: text.slice(0, 500),
          direction: "inbound",
        };

        if (lead) {
          metadata.lead_id = lead.id;
          metadata.lead_name = lead.name;

          await recordInteraction(orgId, lead.id, "message_received", {
            phone: from,
            message: text.slice(0, 500),
          });

          if (containsPessimisticKeyword(text)) {
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

        processedCount++;
        logger.info("WhatsApp inbound processed", {
          event: EVENTS.WHATSAPP_INBOUND,
          matched: !!lead,
          leadId: lead?.id,
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
