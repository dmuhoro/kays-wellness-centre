import { getDb, isDbAvailable } from "../db.server";
import { logger, EVENTS } from "../logger.server";
import { publishEvent } from "../event-bus.server";
import { recordAudit } from "../audit.server";
import { getSession } from "../session.server";

// ── Types ────────────────────────────────────────────────────────────

export type LeadSource = "whatsapp" | "web_form" | "landing_page" | "referral" | "walk_in" | "unknown";

export type PipelineStage = "new" | "contacted" | "scheduled" | "checked_in" | "converted" | "lost";

export interface InboundLeadPayload {
  orgId: string;
  name: string;
  phone?: string;
  email?: string;
  service?: string;
  source: LeadSource;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedLead {
  id: number;
  orgId: string;
  name: string;
  phone: string;
  email: string;
  service: string;
  source: LeadSource;
  stage: PipelineStage;
  priority: string;
  createdAt: string;
  lastActivityAt: string;
}

export interface PipelineColumn {
  stage: PipelineStage;
  label: string;
  leads: UnifiedLead[];
  count: number;
  totalEstimatedValue: number;
}

export interface PipelineBoard {
  orgId: string;
  columns: PipelineColumn[];
  totalLeads: number;
  conversionRate: number;
}

export interface LeadActivityEntry {
  id: number;
  leadId: number;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface LeadSourceStats {
  source: LeadSource;
  count: number;
  percentage: number;
}

// ── Constants ────────────────────────────────────────────────────────

const STAGE_LABELS: Record<PipelineStage, string> = {
  new: "New Leads",
  contacted: "Contacted",
  scheduled: "Scheduled",
  checked_in: "Checked In",
  converted: "Converted",
  lost: "Lost",
};

const STAGE_ORDER: PipelineStage[] = ["new", "contacted", "scheduled", "checked_in", "converted", "lost"];

const DEFAULT_ESTIMATED_VALUE = 2500;

// ── Source Classification ────────────────────────────────────────────

const SOURCE_KEYWORDS: Record<LeadSource, string[]> = {
  whatsapp: ["whatsapp", "wa", "whats"],
  web_form: ["form", "website", "web", "online"],
  landing_page: ["landing", "lp", "ad", "campaign", "facebook", "google"],
  referral: ["referral", "refer", "friend", "family", "doctor"],
  walk_in: ["walk", "in-person", "office", "visit"],
  unknown: [],
};

export function classifyLeadSource(rawSource: string): LeadSource {
  const lower = rawSource.toLowerCase().trim();
  for (const [source, keywords] of Object.entries(SOURCE_KEYWORDS) as Array<[LeadSource, string[]]>) {
    if (source === "unknown") continue;
    if (keywords.some((kw) => lower.includes(kw))) return source;
  }
  return "unknown";
}

// ── Core Functions ───────────────────────────────────────────────────

export async function ingestInboundLead(payload: InboundLeadPayload): Promise<UnifiedLead> {
  const db = await getDb();
  const source = classifyLeadSource(payload.source);
  const stage: PipelineStage = "new";

  const [row] = await db.unsafe<Array<{
    id: number;
    name: string;
    phone: string;
    email: string;
    service: string;
    channel: string;
    priority: string;
    status: string;
    created_at: string;
  }>>(
    `INSERT INTO clinic_leads
       (name, phone, email, service, channel, priority, status, organization_id, raw_payload)
     VALUES ($1, $2, $3, $4, $5, 'medium', 'new', $6, $7)
     RETURNING id, name, phone, email, service, channel, priority, status, created_at`,
    [
      payload.name,
      payload.phone ?? "",
      payload.email ?? "",
      payload.service ?? "",
      source,
      payload.orgId,
      JSON.stringify({ ...payload.metadata, originalSource: payload.source, message: payload.message }),
    ],
  );

  // Record acquisition interaction
  await db.unsafe(
    `INSERT INTO lead_interactions (lead_id, organization_id, event_type, metadata)
     VALUES ($1, $2, 'new', $3)`,
    [row.id, payload.orgId, JSON.stringify({ source, service: payload.service })],
  );

  const lead: UnifiedLead = {
    id: row.id,
    orgId: payload.orgId,
    name: row.name,
    phone: row.phone,
    email: row.email,
    service: row.service,
    source,
    stage,
    priority: row.priority,
    createdAt: row.created_at,
    lastActivityAt: row.created_at,
  };

  publishEvent(payload.orgId, "lead:acquired", {
    leadId: lead.id,
    source,
    name: lead.name,
  }).catch(() => {});

  const session = getSession();
  recordAudit({
    orgId: payload.orgId,
    userId: session?.userId ?? null,
    actionType: "LEAD_INGESTED",
    targetType: "clinic_leads",
    targetId: String(row.id),
    metadata: { source, service: payload.service },
  }).catch(() => {});

  logger.info("Lead ingested via pipeline", {
    event: EVENTS.LEAD_CREATED,
    orgId: payload.orgId,
    leadId: row.id,
    source,
  });

  return lead;
}

export async function advanceLeadStage(
  orgId: string,
  leadId: number,
  toStage: PipelineStage,
): Promise<UnifiedLead | null> {
  const db = await getDb();

  const [existing] = await db.unsafe<Array<{ status: string; name: string }>>(
    `SELECT status, name FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
    [leadId, orgId],
  );
  if (!existing) return null;

  await db.unsafe(
    `UPDATE clinic_leads SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3`,
    [toStage, leadId, orgId],
  );

  await db.unsafe(
    `INSERT INTO lead_interactions (lead_id, organization_id, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [leadId, orgId, toStage, JSON.stringify({ from: existing.status, to: toStage })],
  );

  publishEvent(orgId, "lead:stage_changed", {
    leadId,
    from: existing.status,
    to: toStage,
  }).catch(() => {});

  logger.info("Lead stage advanced", {
    event: EVENTS.AUTOMATION_STAGE_CHANGE,
    orgId,
    leadId,
    from: existing.status,
    to: toStage,
  });

  const [updated] = await db.unsafe<Array<{
    id: number;
    name: string;
    phone: string;
    email: string;
    service: string;
    channel: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>>(
    `SELECT id, name, phone, email, service, channel, priority, status, created_at, updated_at
     FROM clinic_leads WHERE id = $1 AND organization_id = $2`,
    [leadId, orgId],
  );

  return {
    id: updated.id,
    orgId,
    name: updated.name,
    phone: updated.phone,
    email: updated.email,
    service: updated.service,
    source: classifyLeadSource(updated.channel),
    stage: updated.status as PipelineStage,
    priority: updated.priority,
    createdAt: updated.created_at,
    lastActivityAt: updated.updated_at,
  };
}

export async function getPipelineBoard(orgId: string): Promise<PipelineBoard> {
  if (!isDbAvailable()) {
    return {
      orgId,
      columns: STAGE_ORDER.map((s) => ({
        stage: s,
        label: STAGE_LABELS[s],
        leads: [],
        count: 0,
        totalEstimatedValue: 0,
      })),
      totalLeads: 0,
      conversionRate: 0,
    };
  }

  const db = await getDb();

  const rows = await db.unsafe<Array<{
    id: number;
    name: string;
    phone: string;
    email: string;
    service: string;
    channel: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>>(
    `SELECT id, name, phone, email, service, channel, priority, status, created_at, updated_at
     FROM clinic_leads
     WHERE organization_id = $1
     ORDER BY updated_at DESC`,
    [orgId],
  );

  const leads: UnifiedLead[] = rows.map((r) => ({
    id: r.id,
    orgId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    service: r.service,
    source: classifyLeadSource(r.channel),
    stage: r.status as PipelineStage,
    priority: r.priority,
    createdAt: r.created_at,
    lastActivityAt: r.updated_at,
  }));

  const avgValue = await db.unsafe<Array<{ avg_val: number | null }>>(
    `SELECT AVG(total_amount) AS avg_val FROM invoices WHERE organization_id = $1 AND status != 'void'`,
    [orgId],
  );
  const estimatedValue = avgValue[0]?.avg_val ?? DEFAULT_ESTIMATED_VALUE;

  const columns: PipelineColumn[] = STAGE_ORDER.map((stage) => {
    const stageLeads = leads.filter((l) => l.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      leads: stageLeads,
      count: stageLeads.length,
      totalEstimatedValue: Math.round(stageLeads.length * Number(estimatedValue)),
    };
  });

  const totalLeads = leads.length;
  const converted = leads.filter((l) => l.stage === "converted").length;
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 10000) / 100 : 0;

  return { orgId, columns, totalLeads, conversionRate };
}

export async function getLeadSourceStats(orgId: string): Promise<LeadSourceStats[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  const rows = await db.unsafe<Array<{ channel: string; count: string }>>(
    `SELECT channel, COUNT(*)::text AS count
     FROM clinic_leads
     WHERE organization_id = $1
     GROUP BY channel
     ORDER BY count DESC`,
    [orgId],
  );

  const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);

  return rows.map((r) => {
    const count = parseInt(r.count, 10);
    return {
      source: classifyLeadSource(r.channel),
      count,
      percentage: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
    };
  });
}

export async function getLeadActivities(
  orgId: string,
  leadId: number,
  limit = 20,
): Promise<LeadActivityEntry[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  return db.unsafe<LeadActivityEntry[]>(
    `SELECT id, lead_id, event_type, metadata, created_at
     FROM lead_interactions
     WHERE organization_id = $1 AND lead_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [orgId, leadId, limit],
  );
}

export async function searchLeads(
  orgId: string,
  query: string,
  limit = 20,
): Promise<UnifiedLead[]> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  const pattern = `%${query}%`;

  const rows = await db.unsafe<Array<{
    id: number;
    name: string;
    phone: string;
    email: string;
    service: string;
    channel: string;
    priority: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>>(
    `SELECT id, name, phone, email, service, channel, priority, status, created_at, updated_at
     FROM clinic_leads
     WHERE organization_id = $1
       AND (name ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2 OR service ILIKE $2)
     ORDER BY updated_at DESC
     LIMIT $3`,
    [orgId, pattern, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    orgId,
    name: r.name,
    phone: r.phone,
    email: r.email,
    service: r.service,
    source: classifyLeadSource(r.channel),
    stage: r.status as PipelineStage,
    priority: r.priority,
    createdAt: r.created_at,
    lastActivityAt: r.updated_at,
  }));
}

export { STAGE_ORDER, STAGE_LABELS };
