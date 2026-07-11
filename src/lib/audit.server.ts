import { getDb, isDbAvailable } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { requireOrg } from "./tenant.server";

export type AuditActionType =
  | "USER_AUTH"
  | "DATA_EXPORT"
  | "RECORD_DELETED"
  | "PATIENT_TRIAGED"
  | "INVOICE_UPDATED"
  | "PAYMENT_RECORDED"
  | "CONFIG_CHANGED"
  | "LEAD_INGESTED";

export interface AuditLogRow {
  id: number;
  tenant_id: string;
  user_id: number | null;
  action_type: AuditActionType;
  target_type: string;
  target_id: string;
  client_ip: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function ensureAuditSchema(): Promise<boolean> {
  try {
    const db = await getDb();
    await db.unsafe(`
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
    return true;
  } catch (err) {
    logger.error("Audit schema setup failed", {
      event: EVENTS.SCHEMA_SETUP,
      error: (err as Error).message,
    });
    return false;
  }
}

export async function recordAudit({
  orgId,
  userId,
  actionType,
  targetType = "",
  targetId = "",
  clientIp,
  metadata,
}: {
  orgId: string;
  userId?: number | null;
  actionType: AuditActionType;
  targetType?: string;
  targetId?: string;
  clientIp?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isDbAvailable()) return;
  try {
    const db = await getDb();
    await db.unsafe(
      `INSERT INTO audit_logs (tenant_id, user_id, action_type, target_type, target_id, client_ip, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orgId,
        userId ?? null,
        actionType,
        targetType,
        targetId,
        clientIp ?? null,
        metadata ? JSON.stringify(metadata) : "{}",
      ],
    );
    logger.info("Audit log recorded", {
      event: EVENTS.AUDIT_LOG_CREATED,
      actionType,
      targetType,
      targetId,
    });
  } catch (err) {
    logger.error("Failed to record audit log", {
      event: EVENTS.AUDIT_LOG_FAILED,
      actionType,
      error: (err as Error).message,
    });
  }
}

export async function queryAuditLogs(
  orgId: string,
  options: {
    actionType?: AuditActionType;
    targetType?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<AuditLogRow[]> {
  const db = await getDb();
  const conditions: string[] = ["tenant_id = $1"];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (options.actionType) {
    conditions.push(`action_type = $${idx++}`);
    params.push(options.actionType);
  }
  if (options.targetType) {
    conditions.push(`target_type = $${idx++}`);
    params.push(options.targetType);
  }

  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  return db.unsafe<AuditLogRow[]>(
    `SELECT * FROM audit_logs WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );
}
