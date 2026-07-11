import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb, isDbAvailable } from "../db.server";
import { requireOrg } from "../tenant.server";
import { logger, EVENTS } from "../logger.server";
import { publishEvent } from "../event-bus.server";

export interface InteractionRow {
  id: number;
  lead_id: number;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

const PESSIMISTIC_KEYWORDS = ["cancel", "can't make it", "cannot make it", "reschedule", "not coming", "postpone"];

export function containsPessimisticKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return PESSIMISTIC_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function recordInteraction(
  orgId: string,
  leadId: number,
  eventType: string,
  metadata: Record<string, unknown> = {},
): Promise<InteractionRow> {
  const db = await getDb();
  const result = await db.unsafe<Array<{ id: number; lead_id: number; event_type: string; metadata: Record<string, unknown>; created_at: string }>>(
    `INSERT INTO lead_interactions (lead_id, organization_id, event_type, metadata)
     VALUES ($1, $2, $3, $4) RETURNING id, lead_id, event_type, metadata, created_at`,
    [leadId, orgId, eventType, JSON.stringify(metadata)],
  );
  publishEvent(orgId, "interaction:created", {
    leadId,
    eventType,
  }).catch(() => {});
  return result[0] as InteractionRow;
}

export const logInteraction = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      leadId: z.number(),
      eventType: z.string(),
      metadata: z.record(z.unknown()).optional().default({}),
    }),
  )
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return { status: "db_unavailable" as const };

    const { orgId, log } = requireOrg();
    await recordInteraction(orgId, data.leadId, data.eventType, data.metadata);
    log.info("Interaction recorded", {
      event: EVENTS.INTERACTION_RECORDED,
      leadId: data.leadId,
      eventType: data.eventType,
    });
    return { status: "recorded" as const };
  });

export const getLeadInteractions = createServerFn({ method: "GET" })
  .inputValidator(z.object({ leadId: z.number() }))
  .handler(async ({ data }) => {
    if (!isDbAvailable()) return [];

    const { orgId } = requireOrg();
    const db = await getDb();
    const rows = await db.unsafe<InteractionRow[]>(
      `SELECT id, lead_id, event_type, metadata, created_at
       FROM lead_interactions
       WHERE lead_id = $1 AND organization_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [data.leadId, orgId],
    );
    return rows;
  });

export const getLeadsWithPendingReplies = createServerFn({ method: "GET" }).handler(async () => {
  if (!isDbAvailable()) return [];

  const { orgId } = requireOrg();
  const db = await getDb();
  const rows = await db.unsafe<Array<{ lead_id: number }>>(
    `SELECT DISTINCT li.lead_id
     FROM lead_interactions li
     WHERE li.organization_id = $1
       AND li.event_type = 'message_received'
       AND li.created_at > COALESCE(
         (SELECT MAX(created_at) FROM lead_interactions
          WHERE lead_id = li.lead_id AND event_type = 'message_sent'),
         '1970-01-01'
       )`,
    [orgId],
  );
  return rows.map((r) => r.lead_id);
});
