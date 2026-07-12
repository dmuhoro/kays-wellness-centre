import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";
import { publishEvent } from "./event-bus.server";

export interface MessageLedgerRow {
  id: number;
  organization_id: string;
  lead_id: number | null;
  channel: "whatsapp" | "sms";
  direction: "inbound" | "outbound";
  from_address: string;
  to_address: string;
  body: string;
  status: string;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SendMessageInput {
  orgId: string;
  leadId?: number;
  channel: "whatsapp" | "sms";
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  body: string;
  status?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export async function logMessage(input: SendMessageInput): Promise<MessageLedgerRow> {
  const db = await getDb();
  const rows = await db.unsafe<MessageLedgerRow[]>(
    `INSERT INTO message_ledger
       (organization_id, lead_id, channel, direction, from_address, to_address, body, status, external_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.orgId,
      input.leadId ?? null,
      input.channel,
      input.direction,
      input.from,
      input.to,
      input.body,
      input.status ?? (input.direction === "outbound" ? "sent" : "received"),
      input.externalId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const row = rows[0];
  logger.info("Message logged", {
    event: EVENTS.INTERACTION_RECORDED,
    channel: input.channel,
    direction: input.direction,
    orgId: input.orgId,
    leadId: input.leadId,
  });

  if (input.leadId) {
    publishEvent(input.orgId, "message:logged", {
      messageId: row.id,
      leadId: input.leadId,
      channel: input.channel,
      direction: input.direction,
    }).catch(() => {});
  }

  return row;
}

export async function getMessagesForLead(
  orgId: string,
  leadId: number,
  options: { limit?: number; offset?: number } = {},
): Promise<MessageLedgerRow[]> {
  const db = await getDb();
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db.unsafe<MessageLedgerRow[]>(
    `SELECT * FROM message_ledger
     WHERE organization_id = $1 AND lead_id = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [orgId, leadId, limit, offset],
  );
}

export async function getMessagesByChannel(
  orgId: string,
  channel: "whatsapp" | "sms",
  options: { limit?: number; offset?: number; direction?: "inbound" | "outbound" } = {},
): Promise<MessageLedgerRow[]> {
  const db = await getDb();
  const conditions: string[] = ["organization_id = $1", "channel = $2"];
  const params: unknown[] = [orgId, channel];
  let idx = 3;

  if (options.direction) {
    conditions.push(`direction = $${idx++}`);
    params.push(options.direction);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db.unsafe<MessageLedgerRow[]>(
    `SELECT * FROM message_ledger
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );
}

export async function getMessageStats(
  orgId: string,
): Promise<{ total: number; inbound: number; outbound: number; whatsapp: number; sms: number }> {
  if (!isDbAvailable()) return { total: 0, inbound: 0, outbound: 0, whatsapp: 0, sms: 0 };
  const db = await getDb();
  const rows = await db.unsafe<Array<{ direction: string; channel: string; count: string }>>(
    `SELECT direction, channel, COUNT(*)::text AS count
     FROM message_ledger
     WHERE organization_id = $1
     GROUP BY direction, channel`,
    [orgId],
  );

  const stats = { total: 0, inbound: 0, outbound: 0, whatsapp: 0, sms: 0 };
  for (const row of rows) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    if (row.direction === "inbound") stats.inbound += count;
    else stats.outbound += count;
    if (row.channel === "whatsapp") stats.whatsapp += count;
    else stats.sms += count;
  }
  return stats;
}

export async function updateMessageStatus(
  messageId: number,
  status: string,
  externalId?: string,
  orgId?: string,
): Promise<void> {
  const db = await getDb();
  const orgClause = orgId ? ` AND organization_id = $${orgId ? "4" : "3"}` : "";
  if (externalId) {
    if (orgId) {
      await db.unsafe(
        `UPDATE message_ledger SET status = $1, external_id = $2 WHERE id = $3 AND organization_id = $4`,
        [status, externalId, messageId, orgId],
      );
    } else {
      await db.unsafe(
        `UPDATE message_ledger SET status = $1, external_id = $2 WHERE id = $3`,
        [status, externalId, messageId],
      );
    }
  } else {
    if (orgId) {
      await db.unsafe(
        `UPDATE message_ledger SET status = $1 WHERE id = $2 AND organization_id = $3`,
        [status, messageId, orgId],
      );
    } else {
      await db.unsafe(
        `UPDATE message_ledger SET status = $1 WHERE id = $2`,
        [status, messageId],
      );
    }
  }
}

export function maskAddress(address: string): string {
  if (address.length <= 4) return "****";
  return address.slice(0, 3) + "*".repeat(Math.max(0, address.length - 5)) + address.slice(-2);
}

export function formatMessagePreview(body: string, maxLen = 80): string {
  const cleaned = body.replace(/\n/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + "...";
}
