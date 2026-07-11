import { getDb } from "./db.server";
import { logger, EVENTS } from "./logger.server";

export interface ConversionVelocity {
  stageFrom: string;
  stageTo: string;
  avgHours: number;
  medianHours: number;
  sampleSize: number;
}

export interface RevenueAtRisk {
  leadId: number;
  leadName: string;
  phone: string | null;
  stage: string;
  hoursInStage: number;
  estimatedValue: number;
  riskLevel: "low" | "medium" | "high" | "critical";
}

export interface PipelineForecast {
  orgId: string;
  computedAt: string;
  conversionVelocity: ConversionVelocity[];
  revenueAtRisk: RevenueAtRisk[];
  pipelineSummary: {
    totalLeads: number;
    totalConverted: number;
    totalRevenue: number;
    avgConversionHours: number;
    conversionRate: number;
    projectedMonthlyRevenue: number;
  };
}

const STAGE_ORDER = ["new", "contacted", "qualified", "booked", "checked_in", "converted"];

function riskLevelForHours(hours: number): RevenueAtRisk["riskLevel"] {
  if (hours > 168) return "critical";
  if (hours > 72) return "high";
  if (hours > 24) return "medium";
  return "low";
}

export async function computeConversionVelocity(orgId: string): Promise<ConversionVelocity[]> {
  const db = await getDb();

  const rows = await db.unsafe<Array<{
    stage_from: string;
    stage_to: string;
    avg_hours: number;
    median_hours: number;
    sample_size: number;
  }>>(
    `WITH transitions AS (
       SELECT
         lead_id,
         LAG(event_type) OVER (PARTITION BY lead_id ORDER BY created_at) AS stage_from,
         event_type AS stage_to,
         EXTRACT(EPOCH FROM (
           created_at - LAG(created_at) OVER (PARTITION BY lead_id ORDER BY created_at)
         )) / 3600.0 AS hours_between
       FROM lead_interactions
       WHERE organization_id = $1
         AND event_type IN ('new', 'contacted', 'qualified', 'booked', 'checked_in', 'converted')
     )
     SELECT
       stage_from,
       stage_to,
       ROUND(AVG(hours_between)::numeric, 1) AS avg_hours,
       ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hours_between)::numeric, 1) AS median_hours,
       COUNT(*)::int AS sample_size
     FROM transitions
     WHERE stage_from IS NOT NULL AND hours_between > 0 AND hours_between < 8760
     GROUP BY stage_from, stage_to
     ORDER BY avg_hours`,
    [orgId],
  );

  return rows.map((r) => ({
    stageFrom: r.stage_from,
    stageTo: r.stage_to,
    avgHours: Number(r.avg_hours),
    medianHours: Number(r.median_hours),
    sampleSize: r.sample_size,
  }));
}

export async function computeRevenueAtRisk(orgId: string): Promise<RevenueAtRisk[]> {
  const db = await getDb();

  const avgValue = await db.unsafe<Array<{ avg_val: number | null }>>(
    `SELECT AVG(total_amount) AS avg_val FROM invoices WHERE organization_id = $1 AND status != 'void'`,
    [orgId],
  );
  const defaultEstimate = avgValue[0]?.avg_val ?? 2500;

  const rows = await db.unsafe<Array<{
    lead_id: number;
    lead_name: string;
    phone: string | null;
    status: string;
    hours_in_stage: number;
  }>>(
    `SELECT
       cl.id AS lead_id,
       cl.name AS lead_name,
       cl.phone,
       cl.status,
       EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - cl.updated_at)) / 3600.0 AS hours_in_stage
     FROM clinic_leads cl
     WHERE cl.organization_id = $1
       AND cl.status NOT IN ('converted', 'lost', 'archived')
       AND cl.status != 'new'
     ORDER BY hours_in_stage DESC
     LIMIT 50`,
    [orgId],
  );

  return rows.map((r) => ({
    leadId: r.lead_id,
    leadName: r.lead_name,
    phone: r.phone,
    stage: r.status,
    hoursInStage: Math.round(Number(r.hours_in_stage) * 10) / 10,
    estimatedValue: defaultEstimate,
    riskLevel: riskLevelForHours(Number(r.hours_in_stage)),
  }));
}

export async function computePipelineForecast(orgId: string): Promise<PipelineForecast> {
  const db = await getDb();

  const [conversionVelocity, revenueAtRisk, pipelineStats] = await Promise.all([
    computeConversionVelocity(orgId),
    computeRevenueAtRisk(orgId),
    db.unsafe<Array<{
      total_leads: number;
      total_converted: number;
      total_revenue: number;
      avg_conversion_hours: number | null;
    }>>(
      `SELECT
         COUNT(*)::int AS total_leads,
         COUNT(*) FILTER (WHERE status = 'converted')::int AS total_converted,
         COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.total_amount ELSE 0 END), 0)::numeric AS total_revenue,
         (SELECT ROUND(AVG(hours)::numeric, 1)
          FROM (
            SELECT EXTRACT(EPOCH FROM (
              li2.created_at - li1.created_at
            )) / 3600.0 AS hours
            FROM lead_interactions li1
            JOIN lead_interactions li2 ON li1.lead_id = li2.lead_id
              AND li2.event_type = 'converted'
              AND li2.created_at > li1.created_at
            WHERE li1.organization_id = $1
              AND li1.event_type = 'new'
          ) sub
         ) AS avg_conversion_hours
       FROM clinic_leads cl
       LEFT JOIN invoices i ON i.lead_id = cl.id AND i.organization_id = cl.organization_id
       WHERE cl.organization_id = $1`,
      [orgId],
    ),
  ]);

  const stats = pipelineStats[0];
  const totalLeads = stats?.total_leads ?? 0;
  const totalConverted = stats?.total_converted ?? 0;
  const totalRevenue = Number(stats?.total_revenue ?? 0);
  const avgConversionHours = Number(stats?.avg_conversion_hours ?? 0);
  const conversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 10000) / 100 : 0;

  const daysInMonth = 30;
  const daysSinceFirstLead = await db.unsafe<Array<{ days: number }>>(
    `SELECT GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MIN(created_at))) / 86400.0, 1)::numeric AS days
     FROM clinic_leads WHERE organization_id = $1`,
    [orgId],
  );
  const activeDays = Math.max(Number(daysSinceFirstLead[0]?.days ?? 1), 1);
  const dailyRevenue = totalRevenue / activeDays;
  const projectedMonthlyRevenue = Math.round(dailyRevenue * daysInMonth);

  const forecast: PipelineForecast = {
    orgId,
    computedAt: new Date().toISOString(),
    conversionVelocity,
    revenueAtRisk,
    pipelineSummary: {
      totalLeads,
      totalConverted,
      totalRevenue,
      avgConversionHours,
      conversionRate,
      projectedMonthlyRevenue,
    },
  };

  logger.info("Pipeline forecast computed", {
    event: EVENTS.FORECAST_COMPUTED,
    orgId,
    totalLeads,
    totalConverted,
    conversionRate,
    projectedMonthlyRevenue,
  });

  return forecast;
}
