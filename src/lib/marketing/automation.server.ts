import { getDb, isDbAvailable } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { publishEvent } from "../event-bus.server";
import { recordAudit } from "../audit.server";
import { getSession } from "../session.server";

// ── Types ────────────────────────────────────────────────────────────

export type RetentionAction =
  | "preventative_care_reminder"
  | "follow_up_checkup"
  | "vaccination_due"
  | "wellness_screening"
  | "medication_review"
  | "empty_slot_fill";

export type EngagementChannel = "whatsapp" | "sms" | "email";

export interface CareHistoryEntry {
  leadId: number;
  leadName: string;
  phone: string | null;
  lastServiceDate: string | null;
  lastServiceType: string | null;
  totalVisits: number;
  totalRevenue: number;
  daysSinceLastVisit: number | null;
}

export interface RetentionTask {
  id: number;
  orgId: string;
  leadId: number;
  actionType: RetentionAction;
  channel: EngagementChannel;
  message: string;
  scheduledFor: string;
  status: "pending" | "sent" | "failed" | "cancelled";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface EmptySlotCandidate {
  leadId: number;
  leadName: string;
  phone: string | null;
  preferredService: string | null;
  daysSinceLastVisit: number;
  retentionScore: number;
}

export interface RetentionScore {
  leadId: number;
  visitFrequency: number;
  recencyScore: number;
  monetaryValue: number;
  overallScore: number;
  segment: "at_risk" | "needs_attention" | "healthy" | "champion";
}

export interface RetentionCampaign {
  orgId: string;
  actionType: RetentionAction;
  targetCount: number;
  scheduledCount: number;
  channel: EngagementChannel;
  messageTemplate: string;
}

// ── Constants ────────────────────────────────────────────────────────

const CARE_REMINDER_THRESHOLDS: Record<RetentionAction, number> = {
  preventative_care_reminder: 90,
  follow_up_checkup: 30,
  vaccination_due: 365,
  wellness_screening: 180,
  medication_review: 60,
  empty_slot_fill: 7,
};

const MESSAGE_TEMPLATES: Record<RetentionAction, string> = {
  preventative_care_reminder:
    "Hi {{name}}, it's been {{days}} days since your last visit. Time for your preventative care checkup at Kay's Wellness Centre. Book now: {{bookingUrl}}",
  follow_up_checkup:
    "Hi {{name}}, we'd love to see you for a follow-up checkup. It's been {{days}} since your last appointment. Call us or reply to book.",
  vaccination_due:
    "Hi {{name}}, your vaccination is due. Please visit Kay's Wellness Centre or reply to schedule your appointment.",
  wellness_screening:
    "Hi {{name}}, it's time for your wellness screening. Regular checkups help keep you healthy. Book your slot today!",
  medication_review:
    "Hi {{name}}, your medication review is due. Our practitioners are ready to help. Reply to schedule.",
  empty_slot_fill:
    "Hi {{name}}, we have an opening today at Kay's Wellness Centre! Would you like to fill this slot? Reply YES to confirm.",
};

// ── Retention Scoring ────────────────────────────────────────────────

export function computeRetentionScore(history: CareHistoryEntry): RetentionScore {
  const daysSinceVisit = history.daysSinceLastVisit ?? 999;

  // Visit frequency: more visits = higher score (capped at 20)
  const visitFrequency = Math.min(history.totalVisits * 2, 20);

  // Recency: recent visits score higher (0-30)
  let recencyScore: number;
  if (daysSinceVisit <= 30) recencyScore = 30;
  else if (daysSinceVisit <= 90) recencyScore = 20;
  else if (daysSinceVisit <= 180) recencyScore = 10;
  else if (daysSinceVisit <= 365) recencyScore = 5;
  else recencyScore = 0;

  // Monetary: revenue contribution (0-30)
  const monetaryValue = Math.min(Math.round(history.totalRevenue / 1000), 30);

  const overallScore = visitFrequency + recencyScore + monetaryValue;

  let segment: RetentionScore["segment"];
  if (overallScore >= 60) segment = "champion";
  else if (overallScore >= 40) segment = "healthy";
  else if (overallScore >= 20) segment = "needs_attention";
  else segment = "at_risk";

  return { leadId: history.leadId, visitFrequency, recencyScore, monetaryValue, overallScore, segment };
}

// ── Care History ─────────────────────────────────────────────────────

export async function getCareHistory(orgId: string): Promise<CareHistoryEntry[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  const rows = await db.unsafe<Array<{
    lead_id: number;
    lead_name: string;
    phone: string | null;
    last_service_date: string | null;
    last_service_type: string | null;
    total_visits: string;
    total_revenue: string;
  }>>(
    `SELECT
       cl.id AS lead_id,
       cl.name AS lead_name,
       cl.phone,
       MAX(li.created_at)::text AS last_service_date,
       (ARRAY_AGG(li.event_type ORDER BY li.created_at DESC))[1] AS last_service_type,
       COUNT(DISTINCT li.id)::text AS total_visits,
       COALESCE(SUM(CASE WHEN inv.status = 'paid' THEN inv.total_amount ELSE 0 END), 0)::text AS total_revenue
     FROM clinic_leads cl
     LEFT JOIN lead_interactions li ON li.lead_id = cl.id AND li.organization_id = cl.organization_id
     LEFT JOIN invoices inv ON inv.lead_id = cl.id AND inv.organization_id = cl.organization_id
     WHERE cl.organization_id = $1
     GROUP BY cl.id, cl.name, cl.phone
     ORDER BY cl.name`,
    [orgId],
  );

  const now = Date.now();
  return rows.map((r) => ({
    leadId: r.lead_id,
    leadName: r.lead_name,
    phone: r.phone,
    lastServiceDate: r.last_service_date,
    lastServiceType: r.last_service_type,
    totalVisits: parseInt(r.total_visits, 10),
    totalRevenue: Number(r.total_revenue),
    daysSinceLastVisit: r.last_service_date
      ? Math.round((now - new Date(r.last_service_date).getTime()) / 86_400_000)
      : null,
  }));
}

export async function getRetentionScores(orgId: string): Promise<RetentionScore[]> {
  const history = await getCareHistory(orgId);
  return history.map(computeRetentionScore);
}

// ── Retention Task Management ────────────────────────────────────────

export async function scheduleRetentionTask(
  orgId: string,
  leadId: number,
  actionType: RetentionAction,
  channel: EngagementChannel = "whatsapp",
  customMessage?: string,
): Promise<RetentionTask> {
  const db = await getDb();

  const [lead] = await db.unsafe<Array<{ name: string; phone: string | null }>>(
    `SELECT name, phone FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
    [leadId, orgId],
  );
  if (!lead) throw new Error("Lead not found");

  const template = customMessage ?? MESSAGE_TEMPLATES[actionType];
  const message = template
    .replace("{{name}}", lead.name)
    .replace("{{days}}", String(CARE_REMINDER_THRESHOLDS[actionType]))
    .replace("{{bookingUrl}}", `/book?org=${orgId}`);

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + 3600_000); // 1 hour from now

  const [row] = await db.unsafe<Array<{
    id: number;
    status: string;
    created_at: string;
  }>>(
    `INSERT INTO retention_tasks
       (organization_id, lead_id, action_type, channel, message, scheduled_for, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
     RETURNING id, status, created_at`,
    [
      orgId,
      leadId,
      actionType,
      channel,
      message,
      scheduledFor.toISOString(),
      JSON.stringify({ leadName: lead.name, actionType }),
    ],
  );

  const task: RetentionTask = {
    id: row.id,
    orgId,
    leadId,
    actionType,
    channel,
    message,
    scheduledFor: scheduledFor.toISOString(),
    status: "pending",
    metadata: { leadName: lead.name },
    createdAt: row.created_at,
  };

  publishEvent(orgId, "retention:scheduled", {
    taskId: task.id,
    leadId,
    actionType,
  }).catch(() => {});

  logger.info("Retention task scheduled", {
    event: EVENTS.AUTOMATION_FOLLOWUP,
    orgId,
    leadId,
    actionType,
    taskId: row.id,
  });

  return task;
}

export async function getPendingRetentionTasks(orgId: string): Promise<RetentionTask[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  return db.unsafe<RetentionTask[]>(
    `SELECT id, organization_id AS orgId, lead_id AS leadId, action_type AS actionType,
            channel, message, scheduled_for AS scheduledFor, status, metadata, created_at AS createdAt
     FROM retention_tasks
     WHERE organization_id = $1 AND status = 'pending'
     ORDER BY scheduled_for ASC`,
    [orgId],
  );
}

export async function markRetentionTaskSent(taskId: number, orgId: string): Promise<void> {
  const db = await getDb();
  await db.unsafe(
    `UPDATE retention_tasks SET status = 'sent' WHERE id = $1 AND organization_id = $2`,
    [taskId, orgId],
  );

  publishEvent(orgId, "retention:sent", { taskId }).catch(() => {});
}

export async function markRetentionTaskFailed(taskId: number, orgId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.unsafe(
    `UPDATE retention_tasks SET status = 'failed', metadata = metadata || $3 WHERE id = $1 AND organization_id = $2`,
    [taskId, orgId, JSON.stringify({ error })],
  );
}

// ── Empty Slot Fill Engine ───────────────────────────────────────────

export async function findEmptySlotCandidates(
  orgId: string,
  maxResults = 10,
): Promise<EmptySlotCandidate[]> {
  if (!isDbAvailable()) return [];

  const history = await getCareHistory(orgId);
  const scores = history.map(computeRetentionScore);

  // Get leads with phone numbers who haven't visited recently
  const candidates = history
    .filter((h) => h.phone && h.daysSinceLastVisit !== null && h.daysSinceLastVisit >= 7)
    .map((h) => {
      const score = scores.find((s) => s.leadId === h.leadId);
      return {
        leadId: h.leadId,
        leadName: h.leadName,
        phone: h.phone,
        preferredService: h.lastServiceType,
        daysSinceLastVisit: h.daysSinceLastVisit!,
        retentionScore: score?.overallScore ?? 0,
      };
    })
    .sort((a, b) => b.retentionScore - a.retentionScore)
    .slice(0, maxResults);

  return candidates;
}

// ── Campaign Generation ─────────────────────────────────────────────

export async function generateRetentionCampaign(
  orgId: string,
  actionType: RetentionAction,
  channel: EngagementChannel = "whatsapp",
): Promise<RetentionCampaign> {
  const db = await getDb();
  const threshold = CARE_REMINDER_THRESHOLDS[actionType];

  // Count leads eligible for this action
  const [stats] = await db.unsafe<Array<{ eligible: string }>>(
    `SELECT COUNT(*)::text AS eligible
     FROM clinic_leads cl
     LEFT JOIN lead_interactions li ON li.lead_id = cl.id AND li.organization_id = cl.organization_id
     WHERE cl.organization_id = $1
       AND cl.status NOT IN ('converted', 'lost', 'archived')
       AND (li.created_at IS NULL OR li.created_at < CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL)
     GROUP BY cl.id`,
    [orgId, String(threshold)],
  );

  const targetCount = parseInt(stats?.eligible ?? "0", 10);
  const messageTemplate = MESSAGE_TEMPLATES[actionType];

  return {
    orgId,
    actionType,
    targetCount,
    scheduledCount: 0,
    channel,
    messageTemplate,
  };
}

// ── Retention Stats ─────────────────────────────────────────────────

export async function getRetentionStats(orgId: string): Promise<{
  totalTasks: number;
  pending: number;
  sent: number;
  failed: number;
  atRiskCount: number;
  championCount: number;
}> {
  if (!isDbAvailable()) {
    return { totalTasks: 0, pending: 0, sent: 0, failed: 0, atRiskCount: 0, championCount: 0 };
  }

  const db = await getDb();

  const [taskStats] = await db.unsafe<Array<{
    total: string;
    pending: string;
    sent: string;
    failed: string;
  }>>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending,
       COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
     FROM retention_tasks
     WHERE organization_id = $1`,
    [orgId],
  );

  const scores = await getRetentionScores(orgId);
  const atRiskCount = scores.filter((s) => s.segment === "at_risk").length;
  const championCount = scores.filter((s) => s.segment === "champion").length;

  return {
    totalTasks: parseInt(taskStats?.total ?? "0", 10),
    pending: parseInt(taskStats?.pending ?? "0", 10),
    sent: parseInt(taskStats?.sent ?? "0", 10),
    failed: parseInt(taskStats?.failed ?? "0", 10),
    atRiskCount,
    championCount,
  };
}
