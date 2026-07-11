import { getDb, isDbAvailable } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { getSession } from "./session.server";
import { publishEvent } from "./event-bus.server";

export interface MilestoneDefinition {
  key: string;
  label: string;
  category: "activation" | "engagement" | "revenue" | "retention";
  description: string;
}

export const MILESTONES: Record<string, MilestoneDefinition> = {
  FIRST_LEAD_CREATED: {
    key: "FIRST_LEAD_CREATED",
    label: "First Lead Created",
    category: "activation",
    description: "Clinic created their first patient lead",
  },
  FIRST_CSV_IMPORTED: {
    key: "FIRST_CSV_IMPORTED",
    label: "First CSV Imported",
    category: "activation",
    description: "Clinic bulk-imported leads via CSV",
  },
  FIRST_APPOINTMENT_BOOKED: {
    key: "FIRST_APPOINTMENT_BOOKED",
    label: "First Appointment Booked",
    category: "engagement",
    description: "Clinic scheduled their first appointment",
  },
  FIRST_INVOICE_ISSUED: {
    key: "FIRST_INVOICE_ISSUED",
    label: "First Invoice Issued",
    category: "revenue",
    description: "Clinic issued their first invoice",
  },
  FIRST_PAYMENT_RECEIVED: {
    key: "FIRST_PAYMENT_RECEIVED",
    label: "First Payment Received",
    category: "revenue",
    description: "Clinic received their first payment",
  },
  FIRST_WHATSAPP_SENT: {
    key: "FIRST_WHATSAPP_SENT",
    label: "First WhatsApp Sent",
    category: "engagement",
    description: "Clinic sent their first WhatsApp message",
  },
  FIRST_WEBHOOK_CONFIGURED: {
    key: "FIRST_WEBHOOK_CONFIGURED",
    label: "First Webhook Configured",
    category: "activation",
    description: "Clinic set up their first outbound webhook",
  },
  LEAD_PIPELINE_ACTIVE: {
    key: "LEAD_PIPELINE_ACTIVE",
    label: "Pipeline Active (10+ Leads)",
    category: "engagement",
    description: "Clinic has 10 or more active leads",
  },
  SUBSCRIPTION_CONVERTED: {
    key: "SUBSCRIPTION_CONVERTED",
    label: "Subscription Converted",
    category: "revenue",
    description: "Clinic converted from trial to paid subscription",
  },
  ONBOARDING_COMPLETED: {
    key: "ONBOARDING_COMPLETED",
    label: "Onboarding Completed",
    category: "activation",
    description: "Clinic completed the configuration wizard",
  },
  FIRST_EXPORT_GENERATED: {
    key: "FIRST_EXPORT_GENERATED",
    label: "First Export Generated",
    category: "engagement",
    description: "Clinic exported data (QuickBooks/Xero/CSV)",
  },
  MULTI_PROVIDER_SCHEDULED: {
    key: "MULTI_PROVIDER_SCHEDULED",
    label: "Multi-Provider Scheduled",
    category: "engagement",
    description: "Clinic scheduled appointments across multiple providers",
  },
  STREAK_7_DAYS: {
    key: "STREAK_7_DAYS",
    label: "7-Day Active Streak",
    category: "retention",
    description: "Clinic logged in 7 consecutive days",
  },
};

export interface TrackedMilestone {
  id: number;
  organizationId: string;
  userId: number | null;
  milestoneKey: string;
  milestoneLabel: string;
  category: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function trackUserMilestone(
  orgId: string,
  milestoneKey: string,
  metadata: Record<string, unknown> = {},
): Promise<{ tracked: boolean; isNew: boolean }> {
  const definition = MILESTONES[milestoneKey];
  if (!definition) {
    logger.warn("Unknown milestone key", {
      event: EVENTS.MILESTONE_TRACKED,
      orgId,
      milestoneKey,
    });
    return { tracked: false, isNew: false };
  }

  if (!isDbAvailable()) {
    return { tracked: false, isNew: false };
  }

  const db = await getDb();
  const session = getSession();
  const userId = session?.userId ?? null;

  const existing = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM product_milestones
     WHERE organization_id = $1 AND milestone_key = $2`,
    [orgId, milestoneKey],
  );

  if (existing.length > 0) {
    return { tracked: true, isNew: false };
  }

  try {
    await db.unsafe(
      `INSERT INTO product_milestones (organization_id, user_id, milestone_key, milestone_label, metadata)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, milestone_key) DO NOTHING`,
      [orgId, userId, milestoneKey, definition.label, JSON.stringify(metadata)],
    );

    publishEvent(orgId, "milestone:tracked", {
      milestoneKey,
      label: definition.label,
      category: definition.category,
    }).catch(() => {});

    logger.info("Milestone tracked", {
      event: EVENTS.MILESTONE_TRACKED,
      orgId,
      milestoneKey,
      label: definition.label,
      category: definition.category,
    });

    return { tracked: true, isNew: true };
  } catch {
    return { tracked: false, isNew: false };
  }
}

export async function hasMilestone(
  orgId: string,
  milestoneKey: string,
): Promise<boolean> {
  if (!isDbAvailable()) return false;
  const db = await getDb();
  const rows = await db.unsafe<Array<{ id: number }>>(
    `SELECT id FROM product_milestones
     WHERE organization_id = $1 AND milestone_key = $2`,
    [orgId, milestoneKey],
  );
  return rows.length > 0;
}

export async function getOrgMilestones(orgId: string): Promise<TrackedMilestone[]> {
  if (!isDbAvailable()) return [];
  const db = await getDb();
  const rows = await db.unsafe<Array<{
    id: number;
    organization_id: string;
    user_id: number | null;
    milestone_key: string;
    milestone_label: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>>(
    `SELECT * FROM product_milestones
     WHERE organization_id = $1
     ORDER BY created_at ASC`,
    [orgId],
  );

  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    milestoneKey: r.milestone_key,
    milestoneLabel: r.milestone_label,
    category: MILESTONES[r.milestone_key]?.category ?? "activation",
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
  }));
}

export async function getMilestoneStats(): Promise<{
  totalOrgs: number;
  orgsWithMilestones: number;
  milestoneCounts: Record<string, number>;
  activationRate: number;
}> {
  if (!isDbAvailable()) {
    return { totalOrgs: 0, orgsWithMilestones: 0, milestoneCounts: {}, activationRate: 0 };
  }

  const db = await getDb();

  const [totalRow, milestoneRows, activationRows] = await Promise.all([
    db.unsafe<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM organizations`,
    ),
    db.unsafe<Array<{ milestone_key: string; count: string }>>(
      `SELECT milestone_key, COUNT(*)::text AS count
       FROM product_milestones
       GROUP BY milestone_key
       ORDER BY count DESC`,
    ),
    db.unsafe<Array<{ count: string }>>(
      `SELECT COUNT(DISTINCT organization_id)::text AS count
       FROM product_milestones
       WHERE milestone_key = 'ONBOARDING_COMPLETED'`,
    ),
  ]);

  const totalOrgs = parseInt(totalRow[0]?.count ?? "0", 10);
  const orgsWithMilestones = parseInt(activationRows[0]?.count ?? "0", 10);
  const milestoneCounts: Record<string, number> = {};
  for (const row of milestoneRows) {
    milestoneCounts[row.milestone_key] = parseInt(row.count, 10);
  }

  return {
    totalOrgs,
    orgsWithMilestones,
    milestoneCounts,
    activationRate: totalOrgs > 0 ? Math.round((orgsWithMilestones / totalOrgs) * 10000) / 100 : 0,
  };
}

export function listMilestones(): MilestoneDefinition[] {
  return Object.values(MILESTONES);
}

export function getMilestoneDefinition(key: string): MilestoneDefinition | undefined {
  return MILESTONES[key];
}
