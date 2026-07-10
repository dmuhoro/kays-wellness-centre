import { logger, EVENTS } from "./logger.server";
import { requireDatabaseUrl } from "./env.server";

let sql: ReturnType<typeof import("postgres")> | null = null;
let dbAvailable = false;
let connectionError: string | null = null;

async function loadPostgres() {
  const modName = ["p", "o", "s", "t", "g", "r", "e", "s"].join("");
  return await import(modName);
}

export async function getDb(): Promise<ReturnType<typeof import("postgres")>> {
  if (sql) return sql;

  const url = requireDatabaseUrl();

  const postgres = await loadPostgres();

  sql = postgres.default(url, {
    max: 4,
    idle_timeout: 20,
    connect_timeout: 10,
    onclose: () => {
      dbAvailable = false;
    },
  });

  dbAvailable = true;
  connectionError = null;
  return sql;
}

export function isDbAvailable(): boolean {
  return dbAvailable;
}

export function getConnectionError(): string | null {
  return connectionError;
}

export async function withDb<T>(
  fn: (db: ReturnType<typeof import("postgres")>) => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    const db = await getDb();
    return await fn(db);
  } catch (err) {
    dbAvailable = false;
    connectionError =
      err instanceof Error ? err.message : "Unknown database error";
    logger.error("Database connection failed, using fallback", {
      event: EVENTS.DB_UNAVAILABLE,
      error: connectionError,
    });
    return fallback();
  }
}

export async function ensureSchema(multiTenant = false): Promise<boolean> {
  try {
    const db = await getDb();
    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS clinic_leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL DEFAULT '',
        email VARCHAR(255) NOT NULL DEFAULT '',
        service VARCHAR(100) NOT NULL DEFAULT '',
        channel VARCHAR(50) NOT NULL DEFAULT '',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        raw_payload JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    if (multiTenant) {
      await db.unsafe(`
        CREATE TABLE IF NOT EXISTS organizations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(100) NOT NULL UNIQUE,
          timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
          settings JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL DEFAULT '',
          role VARCHAR(50) NOT NULL DEFAULT 'staff',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, email)
        );

        CREATE TABLE IF NOT EXISTS clinic_availability (
          id SERIAL PRIMARY KEY,
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
          start_time TIME NOT NULL,
          end_time TIME NOT NULL,
          slot_duration_minutes INT NOT NULL DEFAULT 60,
          UNIQUE(organization_id, day_of_week, start_time)
        );
      `);

      const hasOrgIdCol = await db.unsafe(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'clinic_leads' AND column_name = 'organization_id'
      `);
      if (hasOrgIdCol.length === 0) {
        await db.unsafe(`
          ALTER TABLE clinic_leads ADD COLUMN organization_id UUID REFERENCES organizations(id);
          ALTER TABLE clinic_leads ADD COLUMN appointment_timestamp TIMESTAMP WITH TIME ZONE;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_org_appt
            ON clinic_leads (organization_id, appointment_timestamp)
            WHERE appointment_timestamp IS NOT NULL;
        `);
      }
    }

    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS lead_interactions (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES clinic_leads(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id),
        event_type VARCHAR(50) NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead
        ON lead_interactions (lead_id, created_at DESC);

    `);

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
    logger.error("Schema setup failed", {
      event: EVENTS.SCHEMA_SETUP,
      error: (err as Error).message,
    });
    dbAvailable = false;
    return false;
  }
}
