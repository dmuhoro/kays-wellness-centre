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

export async function getConcurrentLock(
  key: string,
  timeoutMs = 3_000,
): Promise<boolean> {
  const db = await getDb();
  try {
    const result = await db.unsafe<Array<{ locked: boolean }>>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
      [key],
    );
    if (!result[0]?.locked) {
      logger.warn("Concurrent lock acquisition failed", {
        event: EVENTS.RESOURCE_CONFLICT,
        lockKey: key,
      });
      return false;
    }
    setTimeout(async () => {
      try {
        await db.unsafe(`SELECT pg_advisory_unlock(hashtext($1))`, [key]);
      } catch {
        // Best-effort unlock
      }
    }, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export async function releaseConcurrentLock(key: string): Promise<void> {
  const db = await getDb();
  await db.unsafe(`SELECT pg_advisory_unlock(hashtext($1))`, [key]).catch(() => {});
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

        CREATE TABLE IF NOT EXISTS automation_state (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER NOT NULL REFERENCES clinic_leads(id) ON DELETE CASCADE,
          organization_id UUID NOT NULL REFERENCES organizations(id),
          current_stage VARCHAR(20) NOT NULL DEFAULT 'UNTOUCHED',
          last_interaction_at TIMESTAMP WITH TIME ZONE,
          next_action_scheduled_at TIMESTAMP WITH TIME ZONE,
          retry_count SMALLINT NOT NULL DEFAULT 0,
          context_snapshot JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(lead_id)
        );
        CREATE INDEX IF NOT EXISTS idx_automation_state_org_stage
          ON automation_state (organization_id, current_stage);
        CREATE INDEX IF NOT EXISTS idx_automation_state_next_action
          ON automation_state (organization_id, next_action_scheduled_at)
          WHERE next_action_scheduled_at IS NOT NULL;

        CREATE TABLE IF NOT EXISTS clinic_configuration (
          id SERIAL PRIMARY KEY,
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          business_hours JSONB NOT NULL DEFAULT '{}',
          slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
          triage_timeout_minutes INTEGER NOT NULL DEFAULT 45,
          custom_keywords JSONB NOT NULL DEFAULT '[]',
          timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id)
        );

        CREATE TABLE IF NOT EXISTS resources (
          id SERIAL PRIMARY KEY,
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          type VARCHAR(20) NOT NULL CHECK (type IN ('PROVIDER', 'ROOM')),
          status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_resources_org_type
          ON resources (organization_id, type);

        CREATE TABLE IF NOT EXISTS invoices (
          id SERIAL PRIMARY KEY,
          lead_id INTEGER NOT NULL REFERENCES clinic_leads(id) ON DELETE CASCADE,
          organization_id UUID NOT NULL REFERENCES organizations(id),
          invoice_number VARCHAR(30) NOT NULL,
          total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          paid_at TIMESTAMP WITH TIME ZONE,
          due_at TIMESTAMP WITH TIME ZONE,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, invoice_number)
        );
        CREATE INDEX IF NOT EXISTS idx_invoices_org_status
          ON invoices (organization_id, status);
        CREATE INDEX IF NOT EXISTS idx_invoices_lead
          ON invoices (lead_id);

        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          organization_id UUID NOT NULL REFERENCES organizations(id),
          amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
          method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'mobile_money', 'card')),
          receipt_number VARCHAR(30) NOT NULL,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(organization_id, receipt_number)
        );
        CREATE INDEX IF NOT EXISTS idx_payments_invoice
          ON payments (invoice_id);
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

      const hasProviderCol = await db.unsafe(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'clinic_leads' AND column_name = 'provider_id'
      `);
      if (hasProviderCol.length === 0) {
        await db.unsafe(`
          ALTER TABLE clinic_leads ADD COLUMN provider_id INTEGER REFERENCES resources(id);
          ALTER TABLE clinic_leads ADD COLUMN room_id INTEGER REFERENCES resources(id);
        `);
      }

      const hasSubTierCol = await db.unsafe(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'subscription_tier'
      `);
      if (hasSubTierCol.length === 0) {
        await db.unsafe(`
          ALTER TABLE organizations ADD COLUMN subscription_tier VARCHAR(20) NOT NULL DEFAULT 'starter';
          ALTER TABLE organizations ADD COLUMN subscription_status VARCHAR(20) NOT NULL DEFAULT 'active';
          ALTER TABLE organizations ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;
          ALTER TABLE organizations ADD COLUMN leads_used INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE organizations ADD COLUMN storage_used_bytes BIGINT NOT NULL DEFAULT 0;
          ALTER TABLE organizations ADD COLUMN usage_refreshed_at TIMESTAMP WITH TIME ZONE;
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

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        action_type VARCHAR(30) NOT NULL,
        target_type VARCHAR(50) NOT NULL DEFAULT '',
        target_id VARCHAR(50) NOT NULL DEFAULT '',
        client_ip VARCHAR(45),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
        ON audit_logs (tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action
        ON audit_logs (tenant_id, action_type);
    `);

    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS slot_reservations (
        id SERIAL PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        appointment_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        provider_id INTEGER REFERENCES resources(id),
        room_id INTEGER REFERENCES resources(id),
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(organization_id, appointment_timestamp)
      );
      CREATE INDEX IF NOT EXISTS idx_slot_reservations_expires
        ON slot_reservations (expires_at);
    `);

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

    await db.unsafe(`
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id SERIAL PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        url VARCHAR(500) NOT NULL,
        secret VARCHAR(128) NOT NULL,
        events JSONB NOT NULL DEFAULT '[]',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_configs_org
        ON webhook_configs (organization_id, active);

      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id SERIAL PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        webhook_config_id INTEGER NOT NULL REFERENCES webhook_configs(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        response_code INTEGER,
        response_time_ms INTEGER,
        error_message TEXT,
        retry_count SMALLINT NOT NULL DEFAULT 0,
        max_retries SMALLINT NOT NULL DEFAULT 3,
        next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org
        ON webhook_deliveries (organization_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status
        ON webhook_deliveries (status, next_retry_at);

      CREATE TABLE IF NOT EXISTS message_ledger (
        id SERIAL PRIMARY KEY,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        lead_id INTEGER REFERENCES clinic_leads(id),
        channel VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        from_address VARCHAR(100) NOT NULL,
        to_address VARCHAR(100) NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        external_id VARCHAR(100),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_message_ledger_lead
        ON message_ledger (lead_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_message_ledger_org
        ON message_ledger (organization_id, created_at DESC);
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
