import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { enqueueNotification } from "../queue.server";
import { logger, EVENTS } from "../logger.server";

export type MessageType = "confirmation" | "triage_followup" | "reminder";

const MESSAGE_TEMPLATES: Record<MessageType, (name: string) => string> = {
  confirmation: (name) =>
    `Hi ${name}, your appointment at Kay's Wellness Centre has been confirmed. ` +
    `Please arrive 15 minutes early. Reply STOP to opt out.`,
  triage_followup: (name) =>
    `Hi ${name}, this is Kay's Wellness Centre following up on your recent inquiry. ` +
    `Our care team is reviewing your case and will reach out shortly. Reply STOP to opt out.`,
  reminder: (name) =>
    `Reminder: You have an appointment at Kay's Wellness Centre tomorrow. ` +
    `Please call us to confirm or reschedule. Reply STOP to opt out.`,
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

export function formatMessage(type: MessageType, name: string, phone?: string): string {
  return MESSAGE_TEMPLATES[type](name);
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

    const { orgId, log } = requireOrg();
    const db = await getDb();

    const rows = await db.unsafe<Array<{ name: string; phone: string; service: string }>>(
      `SELECT name, phone, service FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
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
    const message = formatMessage(data.messageType, lead.name, lead.phone);

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
