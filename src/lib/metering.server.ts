import { getDb, isDbAvailable } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { getOrgSubscription, getTierLimits, type SubscriptionTierId } from "./subscriptions.server";

export interface UsageSnapshot {
  leads_used: number;
  leads_limit: number;
  leads_pct: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  storage_pct: number;
  users_used: number;
  users_limit: number;
  users_pct: number;
}

export async function getUsageSnapshot(orgId: string): Promise<UsageSnapshot> {
  if (!isDbAvailable()) {
    return {
      leads_used: 0, leads_limit: 500, leads_pct: 0,
      storage_used_bytes: 0, storage_limit_bytes: 5 * 1024 * 1024 * 1024, storage_pct: 0,
      users_used: 0, users_limit: 3, users_pct: 0,
    };
  }

  const db = await getDb();
  const sub = await getOrgSubscription(orgId);
  const limits = getTierLimits(sub.tier);

  const orgRow = await db.unsafe<Array<{
    leads_used: number | null;
    storage_used_bytes: number | null;
  }>>(
    `SELECT leads_used, storage_used_bytes FROM organizations WHERE id = $1`,
    [orgId],
  );
  const leadsUsed = orgRow[0]?.leads_used ?? 0;
  const storageUsed = orgRow[0]?.storage_used_bytes ?? 0;

  const usersRow = await db.unsafe<Array<{ count: string }>>(
    `SELECT COUNT(*) AS count FROM users WHERE organization_id = $1`,
    [orgId],
  );
  const usersUsed = parseInt(usersRow[0]?.count ?? "0", 10);

  return {
    leads_used: leadsUsed,
    leads_limit: limits.max_active_leads,
    leads_pct: Math.min(100, Math.round((leadsUsed / limits.max_active_leads) * 100)),
    storage_used_bytes: storageUsed,
    storage_limit_bytes: limits.max_storage_bytes,
    storage_pct: Math.min(100, Math.round((storageUsed / limits.max_storage_bytes) * 100)),
    users_used: usersUsed,
    users_limit: limits.max_users,
    users_pct: Math.min(100, Math.round((usersUsed / limits.max_users) * 100)),
  };
}

export async function checkQuota(
  orgId: string,
  resource: "leads" | "storage" | "users",
  additionalBytes?: number,
): Promise<{ withinQuota: boolean; used: number; limit: number }> {
  const snapshot = await getUsageSnapshot(orgId);

  switch (resource) {
    case "leads":
      return {
        withinQuota: snapshot.leads_used < snapshot.leads_limit,
        used: snapshot.leads_used,
        limit: snapshot.leads_limit,
      };
    case "storage": {
      const total = snapshot.storage_used_bytes + (additionalBytes ?? 0);
      return {
        withinQuota: total < snapshot.storage_limit_bytes,
        used: total,
        limit: snapshot.storage_limit_bytes,
      };
    }
    case "users":
      return {
        withinQuota: snapshot.users_used < snapshot.users_limit,
        used: snapshot.users_used,
        limit: snapshot.users_limit,
      };
    default:
      return { withinQuota: true, used: 0, limit: 0 };
  }
}

export async function incrementLeadsUsed(orgId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  await db.unsafe(
    `UPDATE organizations SET leads_used = leads_used + 1 WHERE id = $1`,
    [orgId],
  ).catch(() => {});
}

export async function decrementLeadsUsed(orgId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  await db.unsafe(
    `UPDATE organizations SET leads_used = GREATEST(leads_used - 1, 0) WHERE id = $1`,
    [orgId],
  ).catch(() => {});
}

export async function addStorageUsed(orgId: string, bytes: number): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();
  await db.unsafe(
    `UPDATE organizations SET storage_used_bytes = storage_used_bytes + $2 WHERE id = $1`,
    [orgId, bytes],
  ).catch(() => {});
}

export async function refreshUsageCounters(orgId: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = await getDb();

  const leadsRow = await db.unsafe<Array<{ count: string }>>(
    `SELECT COUNT(*) AS count FROM clinic_leads
     WHERE organization_id = $1 AND status NOT IN ('closed', 'lost')`,
    [orgId],
  );
  const leadsCount = parseInt(leadsRow[0]?.count ?? "0", 10);

  await db.unsafe(
    `UPDATE organizations
     SET leads_used = $2, usage_refreshed_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [orgId, leadsCount],
  ).catch(() => {});

  logger.info("Usage counters refreshed", {
    event: EVENTS.CONFIG_UPDATED,
    orgId,
    leadsUsed: leadsCount,
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function formatUsage(used: number, limit: number, unit?: string): string {
  const suffix = unit ? ` ${unit}` : "";
  return `${used.toLocaleString()} / ${limit.toLocaleString()}${suffix}`;
}
