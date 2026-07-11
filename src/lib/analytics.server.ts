import { getDb, isDbAvailable } from "./db.server";
import { requireOrg } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";
import { getEnv } from "./env.server";

export interface AnalyticsSnapshot {
  totalLeads: number;
  leadsThisWeek: number;
  leadsThisMonth: number;
  conversionVelocity: number;
  triageToScheduleRate: number;
  noShowPercentage: number;
  revenueAtRisk: number;
  stageBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  accountsReceivable: number;
  monthlyRecurringRevenue: number;
  revenuePerResource: ResourceRevenue[];
  collectionRate: number;
  generatedAt: string;
}

export interface ResourceRevenue {
  resourceId: number;
  name: string;
  type: string;
  revenue: number;
  appointmentCount: number;
}

export async function computeAnalytics(): Promise<AnalyticsSnapshot> {
  const { orgId, log } = requireOrg();
  const db = await getDb();
  const start = Date.now();

  const counts = await db.unsafe<Array<{ status: string; count: number }>>(
    `SELECT status, COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
     GROUP BY status`,
    [orgId],
  );

  const stageBreakdown: Record<string, number> = {};
  let totalLeads = 0;
  for (const row of counts) {
    stageBreakdown[row.status] = row.count;
    totalLeads += row.count;
  }

  const thisWeek = await db.unsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
       AND created_at >= date_trunc('week', CURRENT_TIMESTAMP)`,
    [orgId],
  );
  const leadsThisWeek = thisWeek[0]?.count ?? 0;

  const thisMonth = await db.unsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
       AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [orgId],
  );
  const leadsThisMonth = thisMonth[0]?.count ?? 0;

  const triageCount = counts.find((r) => r.status === "contacted")?.count ?? 0;
  const scheduledCount = counts.find((r) => r.status === "scheduled")?.count ?? 0;
  const triageToScheduleRate = triageCount > 0
    ? Math.round((scheduledCount / triageCount) * 100)
    : 0;

  const convertedCount = counts.find((r) => r.status === "converted")?.count ?? 0;
  const closedCount = counts.find((r) => r.status === "closed")?.count ?? 0;
  const noShowPercentage = scheduledCount > 0
    ? Math.round(((scheduledCount - convertedCount) / scheduledCount) * 100)
    : 0;

  const highPriority = await db.unsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
       AND priority = 'high'
       AND status IN ('pending', 'contacted', 'scheduled')`,
    [orgId],
  );
  const revenuePerLead = getEnv().ANALYTICS_REVENUE_VALUE;
  const revenueAtRisk = (highPriority[0]?.count ?? 0) * revenuePerLead;

  const priorityBreakdownRows = await db.unsafe<Array<{ priority: string; count: number }>>(
    `SELECT priority, COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
     GROUP BY priority`,
    [orgId],
  );
  const priorityBreakdown: Record<string, number> = {};
  for (const row of priorityBreakdownRows) {
    priorityBreakdown[row.priority] = row.count;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
  const leads30d = await db.unsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count
     FROM clinic_leads
     WHERE organization_id = $1
       AND created_at >= $2`,
    [orgId, thirtyDaysAgo],
  );
  const conversionVelocity = Math.round((leads30d[0]?.count ?? 0) / 30);

  // Financial metrics
  const arRows = await db.unsafe<Array<{ total: number }>>(
    `SELECT COALESCE(SUM(i.total_amount), 0) AS total
     FROM invoices i
     WHERE i.organization_id = $1 AND i.status IN ('draft', 'issued')`,
    [orgId],
  );
  const accountsReceivable = Number(arRows[0]?.total ?? 0);

  const mrrRows = await db.unsafe<Array<{ total: number }>>(
    `SELECT COALESCE(SUM(i.total_amount), 0) AS total
     FROM invoices i
     WHERE i.organization_id = $1 AND i.status = 'paid'
       AND i.paid_at >= date_trunc('month', CURRENT_TIMESTAMP)`,
    [orgId],
  );
  const monthlyRecurringRevenue = Number(mrrRows[0]?.total ?? 0);

  const resourceRevenueRows = await db.unsafe<ResourceRevenue[]>(
    `SELECT r.id AS "resourceId", r.name, r.type,
            COALESCE(SUM(p.amount), 0) AS revenue,
            COUNT(DISTINCT cl.id)::int AS "appointmentCount"
     FROM resources r
     LEFT JOIN clinic_leads cl ON (cl.provider_id = r.id OR cl.room_id = r.id)
       AND cl.organization_id = $1
       AND cl.status IN ('converted', 'checked_in')
     LEFT JOIN invoices i ON i.lead_id = cl.id
     LEFT JOIN payments p ON p.invoice_id = i.id
     WHERE r.organization_id = $1 AND r.status = 'active'
     GROUP BY r.id, r.name, r.type
     ORDER BY revenue DESC`,
    [orgId],
  );

  const collectionRows = await db.unsafe<Array<{ paid: number; total: number }>>(
    `SELECT
       COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0) AS paid,
       COALESCE(SUM(i.total_amount), 0) AS total
     FROM invoices i
     WHERE i.organization_id = $1`,
    [orgId],
  );
  const collectionTotal = Number(collectionRows[0]?.total ?? 0);
  const collectionPaid = Number(collectionRows[0]?.paid ?? 0);
  const collectionRate = collectionTotal > 0
    ? Math.round((collectionPaid / collectionTotal) * 100)
    : 0;

  log.info("Analytics computed", {
    event: EVENTS.LEAD_FETCHED,
    totalLeads,
    duration_ms: Date.now() - start,
  });

  return {
    totalLeads,
    leadsThisWeek,
    leadsThisMonth,
    conversionVelocity,
    triageToScheduleRate,
    noShowPercentage: Math.max(0, noShowPercentage),
    revenueAtRisk,
    stageBreakdown,
    priorityBreakdown,
    accountsReceivable: Math.round(accountsReceivable),
    monthlyRecurringRevenue: Math.round(monthlyRecurringRevenue),
    revenuePerResource: resourceRevenueRows.map((r) => ({
      ...r,
      revenue: Math.round(Number(r.revenue)),
    })),
    collectionRate,
    generatedAt: new Date().toISOString(),
  };
}
