import crypto from "node:crypto";
import { getDb, withDb } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { sendWhatsApp, formatMessage, type MessageType } from "./api/dispatch.server";

export async function ensureQueueSchema(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS notification_queue (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL,
        lead_id INTEGER NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        idempotency_key VARCHAR(64) NOT NULL UNIQUE,
        payload_json JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        retry_count SMALLINT NOT NULL DEFAULT 0,
        max_retries SMALLINT NOT NULL DEFAULT 3,
        next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_notification_queue_status
        ON notification_queue (status, next_retry_at);
    `);
    return true;
  } catch (err) {
    logger.error("Queue schema setup failed", {
      event: EVENTS.SCHEMA_SETUP,
      error: (err as Error).message,
    });
    return false;
  }
}

function makeIdempotencyKey(tenantId: string, leadId: number, eventType: string): string {
  return crypto
    .createHash("sha256")
    .update(`${tenantId}:${leadId}:${eventType}`)
    .digest("hex");
}

export async function enqueueNotification({
  orgId,
  leadId,
  eventType,
  payload,
}: {
  orgId: string;
  leadId: number;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<{ id: number | null; status: "queued" | "already_pending" }> {
  await ensureQueueSchema();
  const key = makeIdempotencyKey(orgId, leadId, eventType);
  const db = await getDb();

  const existing = await db.unsafe(
    `SELECT id, status FROM notification_queue WHERE idempotency_key = $1`,
    [key],
  );

  if (existing.length > 0) {
    logger.info("Notification idempotency skip", {
      event: EVENTS.NOTIFICATION_IDEMPOTENCY_SKIP,
      leadId,
      eventType,
      queueId: existing[0].id as number,
    });
    return { id: existing[0].id as number, status: "already_pending" };
  }

  const result = await db.unsafe(
    `INSERT INTO notification_queue (tenant_id, lead_id, event_type, idempotency_key, payload_json)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [orgId, leadId, eventType, key, payload ? JSON.stringify(payload) : null],
  );

  const id = result[0]?.id as number | undefined;
  logger.info("Notification enqueued", {
    event: EVENTS.NOTIFICATION_ENQUEUED,
    queueId: id,
    leadId,
    eventType,
  });

  return { id: id ?? null, status: "queued" };
}

export async function dispatchNotification({
  id,
  tenantId,
  leadId,
  eventType,
  payload,
}: {
  id: number;
  tenantId: string;
  leadId: number;
  eventType: string;
  payload?: Record<string, unknown> | null;
}): Promise<{ success: boolean; error?: string }> {
  logger.info("Processing notification", {
    event: EVENTS.NOTIFICATION_DISPATCHED,
    queueId: id,
    tenantId,
    leadId,
    eventType,
  });

  if (eventType === "lead_created" || eventType.startsWith("msg_")) {
    const db = await getDb();
    const rows = await db.unsafe<Array<{ name: string; phone: string }>>(
      `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
      [leadId, tenantId],
    );

    if (rows.length === 0) {
      logger.warn("Lead not found for notification dispatch", {
        event: EVENTS.NOTIFICATION_FAILED,
        queueId: id,
        leadId,
      });
      return { success: false, error: "Lead not found" };
    }

    const lead = rows[0];
    if (!lead.phone) {
      logger.warn("Lead has no phone number, skipping dispatch", {
        event: EVENTS.NOTIFICATION_FAILED,
        queueId: id,
        leadId,
      });
      return { success: true, error: "No phone number — skipped" };
    }

    let messageType: MessageType = "triage_followup";
    if (eventType.startsWith("msg_")) {
      const suffix = eventType.replace("msg_", "") as MessageType;
      if (["confirmation", "triage_followup", "reminder"].includes(suffix)) {
        messageType = suffix;
      }
    }

    const message = formatMessage(messageType, lead.name, lead.phone);
    const result = await sendWhatsApp(lead.phone, message);
    return result;
  }

  logger.info("Notification dispatch skipped — unknown event type", {
    event: EVENTS.NOTIFICATION_DISPATCHED,
    queueId: id,
    eventType,
  });
  return { success: true };
}

export async function processQueue({
  batchSize = 10,
  tenantId,
  dispatch = dispatchNotification,
}: {
  batchSize?: number;
  tenantId?: string;
  dispatch?: typeof dispatchNotification;
} = {}): Promise<{ processed: number; failed: number }> {
  const schemaOk = await ensureQueueSchema();
  if (!schemaOk) return { processed: 0, failed: 0 };

  const db = await getDb();

  const rows = tenantId
    ? await db.unsafe(
        `SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries
         FROM notification_queue
         WHERE tenant_id = $1 AND status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED`,
        [tenantId, batchSize],
      )
    : await db.unsafe(
        `SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries
         FROM notification_queue
         WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize],
      );

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const {
      id,
      tenant_id,
      lead_id,
      event_type,
      payload_json,
      retry_count,
      max_retries,
    } = row as {
      id: number;
      tenant_id: string;
      lead_id: number;
      event_type: string;
      payload_json: string | null;
      retry_count: number;
      max_retries: number;
    };

    try {
      const result = await dispatch({
        id,
        tenantId: tenant_id,
        leadId: lead_id,
        eventType: event_type,
        payload: payload_json ? JSON.parse(payload_json) : null,
      });

      if (result.success) {
        await db.unsafe(
          `UPDATE notification_queue
           SET status = 'dispatched', processed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id],
        );
        processed++;
      } else {
        throw new Error(result.error || "Dispatch returned failure");
      }
    } catch (err) {
      const nextRetry =
        retry_count + 1 >= max_retries
          ? null
          : new Date(Date.now() + 1000 * Math.pow(2, retry_count));

      const newStatus = retry_count + 1 >= max_retries ? "failed" : "pending";

      await db.unsafe(
        `UPDATE notification_queue
         SET status = $1, retry_count = retry_count + 1, next_retry_at = $2, last_error = $3
         WHERE id = $4`,
        [
          newStatus,
          nextRetry?.toISOString() || null,
          (err as Error).message,
          id,
        ],
      );

      const event = retry_count + 1 >= max_retries ? EVENTS.NOTIFICATION_FAILED : EVENTS.NOTIFICATION_RETRY;
      logger.warn("Notification dispatch failed", {
        event,
        queueId: id,
        leadId: lead_id,
        error: (err as Error).message,
        retryCount: retry_count + 1,
        nextRetryAt: nextRetry?.toISOString(),
      });

      failed++;
    }
  }

  return { processed, failed };
}

export async function processNotifications({
  dispatch = dispatchNotification,
}: {
  dispatch?: typeof dispatchNotification;
} = {}): Promise<{ processed: number; failed: number }> {
  try {
    const schemaOk = await ensureQueueSchema();
    if (!schemaOk) return { processed: 0, failed: 0 };

    const db = await getDb();
    const tenants = await db.unsafe<Array<{ tenant_id: string }>>(
      `SELECT DISTINCT tenant_id FROM notification_queue WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP`,
    );

    let totalProcessed = 0;
    let totalFailed = 0;

    for (const { tenant_id } of tenants) {
      const result = await processQueue({ batchSize: 10, tenantId: tenant_id, dispatch });
      totalProcessed += result.processed;
      totalFailed += result.failed;
    }

    return { processed: totalProcessed, failed: totalFailed };
  } catch (err) {
    logger.error("processNotifications failed", {
      event: EVENTS.QUEUE_SYNC_FAILURE,
      error: (err as Error).message,
    });
    return { processed: 0, failed: 0 };
  }
}
