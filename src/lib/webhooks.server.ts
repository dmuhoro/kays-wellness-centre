import crypto from "node:crypto";
import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";
import { recordAudit } from "./audit.server";
import { getSession } from "./session.server";
import { publishEvent } from "./event-bus.server";

export interface WebhookConfig {
  id: number;
  organization_id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: number;
  organization_id: string;
  webhook_config_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: "pending" | "success" | "failed" | "retrying";
  response_code: number | null;
  response_time_ms: number | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  next_retry_at: string;
  created_at: string;
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload, "utf-8").digest("hex");
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signPayload(payload, secret);
  const prefix = "sha256=";
  const sig = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature;
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function registerWebhook(
  orgId: string,
  url: string,
  events: string[],
): Promise<WebhookConfig> {
  const db = await getDb();
  const secret = generateWebhookSecret();
  const rows = await db.unsafe<WebhookConfig[]>(
    `INSERT INTO webhook_configs (organization_id, url, secret, events)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [orgId, url, secret, JSON.stringify(events)],
  );
  return rows[0];
}

export async function removeWebhook(orgId: string, webhookId: number): Promise<boolean> {
  const db = await getDb();
  const result = await db.unsafe(
    `DELETE FROM webhook_configs WHERE id = $1 AND organization_id = $2`,
    [webhookId, orgId],
  );
  return (result as unknown as { count: number }).count > 0 || result.length > 0;
}

export async function getWebhooks(orgId: string): Promise<WebhookConfig[]> {
  const db = await getDb();
  return db.unsafe<WebhookConfig[]>(
    `SELECT id, organization_id, url, secret, events, active, created_at, updated_at
     FROM webhook_configs
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [orgId],
  );
}

export async function getWebhookDeliveries(
  orgId: string,
  options: { limit?: number; offset?: number; status?: string; eventType?: string } = {},
): Promise<WebhookDelivery[]> {
  const db = await getDb();
  const conditions: string[] = ["wd.organization_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (options.status) {
    conditions.push(`wd.status = $${idx++}`);
    params.push(options.status);
  }
  if (options.eventType) {
    conditions.push(`wd.event_type = $${idx++}`);
    params.push(options.eventType);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db.unsafe<WebhookDelivery[]>(
    `SELECT wd.id, wd.organization_id, wd.webhook_config_id, wd.event_type,
            wd.payload, wd.status, wd.response_code, wd.response_time_ms,
            wd.error_message, wd.retry_count, wd.max_retries, wd.next_retry_at, wd.created_at
     FROM webhook_deliveries wd
     WHERE ${conditions.join(" AND ")}
     ORDER BY wd.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );
}

export async function recordDelivery(
  orgId: string,
  webhookConfigId: number,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const db = await getDb();
  const rows = await db.unsafe<Array<{ id: number }>>(
    `INSERT INTO webhook_deliveries
       (organization_id, webhook_config_id, event_type, payload, status, retry_count, max_retries, next_retry_at)
     VALUES ($1, $2, $3, $4, 'pending', 0, 3, CURRENT_TIMESTAMP)
     RETURNING id`,
    [orgId, webhookConfigId, eventType, JSON.stringify(payload)],
  );
  return rows[0].id;
}

export async function updateDeliveryStatus(
  deliveryId: number,
  status: "success" | "failed" | "retrying",
  responseCode?: number,
  responseTimeMs?: number,
  errorMessage?: string,
  orgId?: string,
): Promise<void> {
  const db = await getDb();
  if (status === "success") {
    if (orgId) {
      await db.unsafe(
        `UPDATE webhook_deliveries SET status = $1, response_code = $2, response_time_ms = $3
         WHERE id = $4 AND organization_id = $5`,
        [status, responseCode ?? null, responseTimeMs ?? null, deliveryId, orgId],
      );
    } else {
      await db.unsafe(
        `UPDATE webhook_deliveries SET status = $1, response_code = $2, response_time_ms = $3
         WHERE id = $4`,
        [status, responseCode ?? null, responseTimeMs ?? null, deliveryId],
      );
    }
  } else if (status === "retrying") {
    if (orgId) {
      await db.unsafe(
        `UPDATE webhook_deliveries
         SET status = $1, retry_count = retry_count + 1,
             next_retry_at = CURRENT_TIMESTAMP + (POWER(2, retry_count) || ' minutes')::interval,
             last_error = $2
         WHERE id = $3 AND organization_id = $4`,
        [status, errorMessage ?? null, deliveryId, orgId],
      );
    } else {
      await db.unsafe(
        `UPDATE webhook_deliveries
         SET status = $1, retry_count = retry_count + 1,
             next_retry_at = CURRENT_TIMESTAMP + (POWER(2, retry_count) || ' minutes')::interval,
             last_error = $2
         WHERE id = $3`,
        [status, errorMessage ?? null, deliveryId],
      );
    }
  } else {
    if (orgId) {
      await db.unsafe(
        `UPDATE webhook_deliveries
         SET status = $1, response_code = $2, response_time_ms = $3, error_message = $4
         WHERE id = $5 AND organization_id = $6`,
        [status, responseCode ?? null, responseTimeMs ?? null, errorMessage ?? null, deliveryId, orgId],
      );
    } else {
      await db.unsafe(
        `UPDATE webhook_deliveries
         SET status = $1, response_code = $2, response_time_ms = $3, error_message = $4
         WHERE id = $5`,
        [status, responseCode ?? null, responseTimeMs ?? null, errorMessage ?? null, deliveryId],
      );
    }
  }
}

export async function dispatchWebhook(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isDbAvailable()) return;

  try {
    const db = await getDb();
    const configs = await db.unsafe<WebhookConfig[]>(
      `SELECT id, url, secret, events
       FROM webhook_configs
       WHERE organization_id = $1 AND active = true`,
      [orgId],
    );

    for (const config of configs) {
      const subscribedEvents = config.events as string[];
      if (!subscribedEvents.includes(eventType) && !subscribedEvents.includes("*")) {
        continue;
      }

      const deliveryId = await recordDelivery(orgId, config.id, eventType, payload);
      const body = JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), payload });
      const signature = signPayload(body, config.secret);

      const startTime = Date.now();
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Clinic-Signature": `sha256=${signature}`,
            "X-Clinic-Event": eventType,
            "X-Clinic-Delivery": String(deliveryId),
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });

        const elapsed = Date.now() - startTime;

        if (response.ok) {
          await updateDeliveryStatus(deliveryId, "success", response.status, elapsed);
          logger.info("Webhook delivered", {
            event: "WEBHOOK_DELIVERED",
            orgId,
            eventType,
            deliveryId,
            responseCode: response.status,
            elapsed,
          });
        } else {
          const errMsg = `HTTP ${response.status}`;
          const shouldRetry = response.status >= 500;
          await updateDeliveryStatus(
            deliveryId,
            shouldRetry ? "retrying" : "failed",
            response.status,
            elapsed,
            errMsg,
          );
          logger.warn("Webhook delivery failed", {
            event: "WEBHOOK_DELIVERY_FAILED",
            orgId,
            eventType,
            deliveryId,
            responseCode: response.status,
          });
        }
      } catch (err) {
        const elapsed = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : "Network error";
        await updateDeliveryStatus(deliveryId, "retrying", undefined, elapsed, errMsg);
        logger.warn("Webhook delivery error", {
          event: "WEBHOOK_DELIVERY_FAILED",
          orgId,
          eventType,
          deliveryId,
          error: errMsg,
        });
      }

      publishEvent(orgId, "webhook:delivered", {
        eventType,
        deliveryId,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error("Webhook dispatch failed", {
      event: "WEBHOOK_DELIVERY_FAILED",
      orgId,
      eventType,
      error: (err as Error).message,
    });
  }
}

export async function getDeliveryStats(
  orgId: string,
): Promise<{ total: number; success: number; failed: number; pending: number }> {
  if (!isDbAvailable()) return { total: 0, success: 0, failed: 0, pending: 0 };
  const db = await getDb();
  const rows = await db.unsafe<Array<{ status: string; count: string }>>(
    `SELECT status, COUNT(*)::text AS count
     FROM webhook_deliveries
     WHERE organization_id = $1
     GROUP BY status`,
    [orgId],
  );

  const stats = { total: 0, success: 0, failed: 0, pending: 0 };
  for (const row of rows) {
    const count = parseInt(row.count, 10);
    stats.total += count;
    if (row.status === "success") stats.success = count;
    else if (row.status === "failed") stats.failed = count;
    else if (row.status === "pending" || row.status === "retrying") stats.pending += count;
  }
  return stats;
}

export async function retryPendingDeliveries(orgId: string): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = await getDb();
  const pending = await db.unsafe<WebhookDelivery[]>(
    `SELECT wd.id, wd.webhook_config_id, wd.event_type, wd.payload
     FROM webhook_deliveries wd
     JOIN webhook_configs wc ON wc.id = wd.webhook_config_id
     WHERE wd.organization_id = $1
       AND wd.status = 'retrying'
       AND wd.retry_count < wd.max_retries
       AND wd.next_retry_at <= CURRENT_TIMESTAMP
     ORDER BY wd.next_retry_at ASC
     LIMIT 10`,
    [orgId],
  );

  let retried = 0;
  for (const delivery of pending) {
    const config = await db.unsafe<{ url: string; secret: string }[]>(
      `SELECT url, secret FROM webhook_configs WHERE id = $1 AND organization_id = $2`,
      [delivery.webhook_config_id, orgId],
    );
    if (!config[0]) continue;

    const body = JSON.stringify({
      event: delivery.event_type,
      timestamp: new Date().toISOString(),
      payload: delivery.payload,
    });
    const signature = signPayload(body, config[0].secret);

    const startTime = Date.now();
    try {
      const response = await fetch(config[0].url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clinic-Signature": `sha256=${signature}`,
          "X-Clinic-Event": delivery.event_type,
          "X-Clinic-Delivery": String(delivery.id),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const elapsed = Date.now() - startTime;
      if (response.ok) {
        await updateDeliveryStatus(delivery.id, "success", response.status, elapsed);
      } else {
        await updateDeliveryStatus(delivery.id, "retrying", response.status, elapsed, `HTTP ${response.status}`);
      }
      retried++;
    } catch (err) {
      const elapsed = Date.now() - startTime;
      await updateDeliveryStatus(delivery.id, "retrying", undefined, elapsed, (err as Error).message);
      retried++;
    }
  }
  return retried;
}
