import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isDbAvailable, getConnectionError, getDb } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { getNodeEnv } from "../env.server";
import { requireOrg } from "../tenant.server";

export const getServerStatus = createServerFn({ method: "GET" }).handler(async () => {
  const available = isDbAvailable();
  logger.info("Server status check", {
    event: EVENTS.ENV_VALIDATION,
    dbAvailable: available,
  });
  return {
    dbAvailable: available,
    dbError: getConnectionError(),
    nodeEnv: getNodeEnv(),
    region: process.env.VERCEL_REGION || "local",
  };
});

interface QueueStatsRow {
  status: string;
  count: number;
}

export interface QueueTelemetry {
  total: number;
  pending: number;
  dispatched: number;
  failed: number;
  stalled: number;
  byStatus: QueueStatsRow[];
}

export const getQueueTelemetry = createServerFn({ method: "GET" }).handler(async (): Promise<QueueTelemetry> => {
  const db = await getDb();
  const rows = await db.unsafe<QueueStatsRow[]>(
    `SELECT status, COUNT(*)::int AS count
     FROM notification_queue
     GROUP BY status`,
  );

  const byStatus = rows;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const pending = rows.find((r) => r.status === "pending")?.count ?? 0;
  const dispatched = rows.find((r) => r.status === "dispatched")?.count ?? 0;
  const failed = rows.find((r) => r.status === "failed")?.count ?? 0;
  const stalled = rows.find((r) => r.status === "stalled")?.count ?? 0;

  return { total, pending, dispatched, failed, stalled, byStatus };
});

export const forceRetryQueueItems = createServerFn({ method: "POST" })
  .inputValidator(z.object({ maxItems: z.number().int().min(1).max(100).default(25) }))
  .handler(async ({ data }) => {
    const db = await getDb();
    const result = await db.unsafe(
      `UPDATE notification_queue
       SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP, retry_count = 0, last_error = NULL
       WHERE status IN ('failed', 'stalled')
         AND id IN (
           SELECT id FROM notification_queue
           WHERE status IN ('failed', 'stalled')
           ORDER BY created_at DESC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
       RETURNING id`,
      [data.maxItems],
    );
    const count = result.length;
    logger.info("Queue force retry", {
      event: EVENTS.QUEUE_SYNC_SUCCESS,
      retryCount: count,
    });
    return { status: "ok" as const, retried: count };
  });

export const getFailedQueueItems = createServerFn({ method: "GET" })
  .handler(async () => {
    const db = await getDb();
    const rows = await db.unsafe(
      `SELECT id, tenant_id, lead_id, event_type, retry_count, max_retries, last_error, created_at, next_retry_at
       FROM notification_queue
       WHERE status IN ('failed', 'stalled')
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    return { status: "ok" as const, items: rows };
  });
