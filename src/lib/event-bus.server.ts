import { getDb, isDbAvailable } from "./db.server";
import { logger, EVENTS } from "./logger.server";

export interface LiveEvent {
  id: number;
  tenant_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function ensureLiveEventsSchema(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS live_events (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_live_events_tenant
        ON live_events (tenant_id, id);
    `);
    return true;
  } catch (err) {
    logger.error("Live events schema setup failed", {
      event: EVENTS.SCHEMA_SETUP,
      error: (err as Error).message,
    });
    return false;
  }
}

export async function publishEvent(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!isDbAvailable()) return;
  try {
    const db = await getDb();
    await db.unsafe(
      `INSERT INTO live_events (tenant_id, event_type, payload) VALUES ($1, $2, $3)`,
      [orgId, eventType, JSON.stringify(payload)],
    );
    logger.info("Live event published", {
      event: EVENTS.SSE_EVENT_PUBLISHED,
      tenant_id: orgId,
      eventType,
    });
  } catch (err) {
    logger.error("Failed to publish live event", {
      event: EVENTS.SSE_EVENT_PUBLISHED,
      error: (err as Error).message,
    });
  }
}

export async function pollLiveEvents(
  orgId: string,
  afterId: number,
  limit = 50,
): Promise<LiveEvent[]> {
  if (!isDbAvailable()) return [];
  try {
    const db = await getDb();
    return db.unsafe<LiveEvent[]>(
      `SELECT id, tenant_id, event_type, payload, created_at
       FROM live_events
       WHERE tenant_id = $1 AND id > $2
       ORDER BY id ASC
       LIMIT $3`,
      [orgId, afterId, limit],
    );
  } catch {
    return [];
  }
}

export async function cleanLiveEvents(
  orgId: string,
  olderThanMs = 600_000,
): Promise<void> {
  if (!isDbAvailable()) return;
  try {
    const db = await getDb();
    await db.unsafe(
      `DELETE FROM live_events
       WHERE tenant_id = $1
         AND created_at < NOW() - ($2 || ' milliseconds')::interval`,
      [orgId, String(olderThanMs)],
    );
  } catch {
    // silently clean
  }
}
