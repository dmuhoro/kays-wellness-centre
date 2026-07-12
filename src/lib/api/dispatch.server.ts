import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { enqueueNotification } from "../queue.server";
import { logger, EVENTS } from "../logger.server";
import { checkRateLimit } from "../rate-limit.server";
import { requireRole, ROLES } from "../permissions.server";

export type MessageType = "confirmation" | "triage_followup" | "reminder";
export type LanguageCode = "en" | "sw";

type TemplateFn = (name: string) => string;

/*
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  HEADSUP — Swahili copy below needs native speaker review              ║
 * ║                                                                        ║
 * ║  I (opencode) am an LLM, not a fluent Swahili speaker. The Swahili     ║
 * ║  translations below are my best attempt for a physiotherapy clinic     ║
 * ║  but may not capture the right clinical/formal tone for Kenyan         ║
 * ║  patients. Have a native Swahili speaker review these before           ║
 * ║  sending to real patients. Tone matters — a literal translation can    ║
 * ║  read wrong in a health context.                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const MESSAGE_TEMPLATES: Record<MessageType, Record<LanguageCode, TemplateFn>> = {
  confirmation: {
    en: (name) =>
      `Hi ${name}, your appointment at Kay's Wellness Centre has been confirmed. ` +
      `Please arrive 15 minutes early. Reply STOP to opt out.`,
    sw: (name) =>
      `Habari ${name}, miadi yako katika Kay's Wellness Centre imethibitishwa. ` +
      `Tafadhali fika dakika 15 kabla ya muda. Tuma STOP kuacha kupokea ujumbe.`,
  },
  triage_followup: {
    en: (name) =>
      `Hi ${name}, this is Kay's Wellness Centre following up on your recent inquiry. ` +
      `Our care team is reviewing your case and will reach out shortly. Reply STOP to opt out.`,
    sw: (name) =>
      `Habari ${name}, ni Kay's Wellness Centre tukifuatilia swali lako la hivi karibuni. ` +
      `Timu yetu inaangalia kesi yako na itawasiliana nawe hivi karibuni. Tuma STOP kuacha kupokea ujumbe.`,
  },
  reminder: {
    en: (name) =>
      `Reminder: You have an appointment at Kay's Wellness Centre tomorrow. ` +
      `Please call us to confirm or reschedule. Reply STOP to opt out.`,
    sw: (name) =>
      `Kikumbusho: Una miadi katika Kay's Wellness Centre kesho. ` +
      `Tafadhali tupigie ili kuthibitisha au kubadilisha ratiba. Tuma STOP kuacha kupokea ujumbe.`,
  },
};

export async function sendWhatsApp(
  phone: string,
  message: string,
): Promise<{ success: boolean; provider: string; error?: string }> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    logger.info("WhatsApp provider not configured, logging message", {
      event: EVENTS.NOTIFICATION_DISPATCHED,
      phone,
      messageLength: message.length,
    });
    return { success: true, provider: "log" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone.replace(/[^0-9]/g, ""),
          type: "text",
          text: { body: message },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error("WhatsApp API returned error", {
        event: EVENTS.NOTIFICATION_FAILED,
        status: res.status,
        body,
      });
      return { success: false, provider: "whatsapp", error: `API returned ${res.status}` };
    }

    logger.info("WhatsApp message sent", {
      event: EVENTS.NOTIFICATION_DISPATCHED,
      phone,
    });
    return { success: true, provider: "whatsapp" };
  } catch (err) {
    logger.error("WhatsApp send failed", {
      event: EVENTS.NOTIFICATION_FAILED,
      error: (err as Error).message,
    });
    return { success: false, provider: "whatsapp", error: (err as Error).message };
  }
}

export function formatMessage(type: MessageType, name: string, language?: LanguageCode): string {
  const lang = language === "sw" ? "sw" : "en";
  return MESSAGE_TEMPLATES[type][lang](name);
}

export const dispatchLeadMessage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      leadId: z.number(),
      messageType: z.enum(["confirmation", "triage_followup", "reminder"]),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const };
    }
    try { requireRole(ROLES.SUPER_ADMIN, ROLES.CLINIC_OWNER, ROLES.CLINIC_STAFF); } catch { return { status: "forbidden" as const }; }

    const { orgId, log } = requireOrg();

    if (!checkRateLimit(`whatsapp:${orgId}`, 20, 60_000)) {
      log.warn("WhatsApp dispatch rate limited", { event: EVENTS.AUTH_FAILURE, orgId });
      return { status: "rate_limited" as const };
    }

    const db = await getDb();

    const rows = await db.unsafe<Array<{ name: string; phone: string; service: string; preferred_language: string }>>(
      `SELECT name, phone, service, preferred_language FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [data.leadId, orgId],
    );

    if (rows.length === 0) {
      log.warn("Lead not found for dispatch", {
        event: EVENTS.LEAD_FETCHED,
        leadId: data.leadId,
      });
      return { status: "lead_not_found" as const };
    }

    const lead = rows[0];
    const message = formatMessage(data.messageType, lead.name, lead.preferred_language as LanguageCode);

    const result = await sendWhatsApp(lead.phone, message);

    if (result.success) {
      await enqueueNotification({
        orgId,
        leadId: data.leadId,
        eventType: `msg_${data.messageType}`,
        payload: { phone: lead.phone, provider: result.provider },
      });
      log.info("Lead message dispatched", {
        event: EVENTS.NOTIFICATION_DISPATCHED,
        leadId: data.leadId,
        messageType: data.messageType,
        provider: result.provider,
      });
      return { status: "dispatched" as const, provider: result.provider };
    }

    return { status: "dispatch_failed" as const, error: result.error };
  });
