import { getDb } from "./db.server";
import { logger, EVENTS } from "./logger.server";

export type ChannelType = "webhook" | "sms" | "whatsapp";
export type DeliveryStatus = "delivered" | "failed" | "fallback";

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_DURATION_MS = 15 * 60 * 1000;

export interface ChannelHealthRecord {
  id: number;
  organization_id: string;
  channel: ChannelType;
  success_count: number;
  fail_count: number;
  last_success_at: string | null;
  last_failure_at: string | null;
  circuit_open: boolean;
  circuit_open_until: string | null;
  updated_at: string;
}

export interface FallbackResult {
  channel: ChannelType;
  status: DeliveryStatus;
  fallbackUsed: boolean;
  attemptedChannels: ChannelType[];
}

const CHANNEL_PRIORITY: ChannelType[] = ["webhook", "whatsapp", "sms"];

function isCircuitOpen(record: ChannelHealthRecord | undefined): boolean {
  if (!record?.circuit_open) return false;
  if (!record.circuit_open_until) return true;
  return new Date(record.circuit_open_until) > new Date();
}

async function getChannelHealth(
  orgId: string,
  channel: ChannelType,
): Promise<ChannelHealthRecord | undefined> {
  const db = await getDb();
  const rows = await db.unsafe<ChannelHealthRecord[]>(
    `SELECT * FROM channel_health WHERE organization_id = $1 AND channel = $2`,
    [orgId, channel],
  );
  return rows[0];
}

async function upsertChannelHealth(
  orgId: string,
  channel: ChannelType,
  success: boolean,
): Promise<void> {
  const db = await getDb();
  const existing = await getChannelHealth(orgId, channel);

  if (!existing) {
    await db.unsafe(
      `INSERT INTO channel_health (organization_id, channel, success_count, fail_count, last_success_at, last_failure_at, circuit_open)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [
        orgId,
        channel,
        success ? 1 : 0,
        success ? 0 : 1,
        success ? new Date().toISOString() : null,
        success ? null : new Date().toISOString(),
      ],
    );
    return;
  }

  const totalFails = existing.fail_count + (success ? 0 : 1);
  const shouldOpen = totalFails >= CIRCUIT_BREAKER_THRESHOLD && !success;
  const openUntil = shouldOpen
    ? new Date(Date.now() + CIRCUIT_BREAKER_DURATION_MS).toISOString()
    : existing.circuit_open_until;

  await db.unsafe(
    `UPDATE channel_health SET
       success_count = success_count + $3,
       fail_count = fail_count + $4,
       last_success_at = COALESCE($5, last_success_at),
       last_failure_at = COALESCE($6, last_failure_at),
       circuit_open = $7,
       circuit_open_until = $8,
       updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = $1 AND channel = $2`,
    [
      orgId,
      channel,
      success ? 1 : 0,
      success ? 0 : 1,
      success ? new Date().toISOString() : null,
      success ? null : new Date().toISOString(),
      shouldOpen,
      openUntil,
    ],
  );
}

async function resetCircuit(orgId: string, channel: ChannelType): Promise<void> {
  const db = await getDb();
  await db.unsafe(
    `UPDATE channel_health SET circuit_open = false, circuit_open_until = NULL, fail_count = 0
     WHERE organization_id = $1 AND channel = $2`,
    [orgId, channel],
  );
}

export async function recordDeliveryAttempt(
  orgId: string,
  channel: ChannelType,
  success: boolean,
): Promise<void> {
  await upsertChannelHealth(orgId, channel, success);
}

export async function getAvailableChannels(orgId: string): Promise<ChannelType[]> {
  const channels: ChannelType[] = [];
  for (const ch of CHANNEL_PRIORITY) {
    const health = await getChannelHealth(orgId, ch);
    if (!isCircuitOpen(health)) {
      channels.push(ch);
    }
  }
  return channels;
}

export async function sendWithFallback(
  orgId: string,
  recipient: string,
  message: string,
  primaryChannel: ChannelType,
  sendFn: (channel: ChannelType, recipient: string, message: string) => Promise<boolean>,
): Promise<FallbackResult> {
  const available = await getAvailableChannels(orgId);
  const primaryIndex = available.indexOf(primaryChannel);
  const orderedChannels: ChannelType[] = primaryIndex >= 0
    ? [primaryChannel, ...available.filter((c) => c !== primaryChannel)]
    : available;

  const attempted: ChannelType[] = [];

  for (const channel of orderedChannels) {
    attempted.push(channel);

    try {
      const success = await sendFn(channel, recipient, message);
      await recordDeliveryAttempt(orgId, channel, success);

      if (success) {
        if (channel !== primaryChannel) {
          logger.info("Fallback delivery succeeded", {
            event: EVENTS.FALLBACK_DELIVERED,
            orgId,
            primaryChannel,
            fallbackChannel: channel,
            recipient,
          });
        }
        return {
          channel,
          status: "delivered",
          fallbackUsed: channel !== primaryChannel,
          attemptedChannels: attempted,
        };
      }
    } catch {
      await recordDeliveryAttempt(orgId, channel, false);
    }
  }

  logger.warn("All channels failed for delivery", {
    event: EVENTS.FALLBACK_TRIGGERED,
    orgId,
    attemptedChannels: attempted,
    recipient,
  });

  return {
    channel: primaryChannel,
    status: "failed",
    fallbackUsed: true,
    attemptedChannels: attempted,
  };
}

export async function getChannelHealthReport(orgId: string): Promise<ChannelHealthRecord[]> {
  const db = await getDb();
  return db.unsafe<ChannelHealthRecord[]>(
    `SELECT * FROM channel_health WHERE organization_id = $1 ORDER BY channel`,
    [orgId],
  );
}

export async function resetChannelCircuit(
  orgId: string,
  channel: ChannelType,
): Promise<void> {
  await resetCircuit(orgId, channel);
  logger.info("Channel circuit breaker reset", {
    event: EVENTS.CONFIG_UPDATED,
    orgId,
    channel,
  });
}
