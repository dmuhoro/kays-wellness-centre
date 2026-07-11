import { getDb, isDbAvailable } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { recordAudit } from "./audit.server";
import { getSession } from "./session.server";
import { publishEvent } from "./event-bus.server";

export const TRIAL_DURATION_DAYS = 14;

export interface TrialStatus {
  orgId: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialConvertedAt: string | null;
  isTrialActive: boolean;
  daysRemaining: number | null;
  isExpired: boolean;
  subscriptionStatus: string;
}

export interface TrialEvaluation {
  status: TrialStatus;
  showPaywall: boolean;
  blockAccess: boolean;
  message: string | null;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.ceil((b.getTime() - a.getTime()) / msPerDay);
}

export async function getTrialStatus(orgId: string): Promise<TrialStatus> {
  if (!isDbAvailable()) {
    return {
      orgId,
      trialStartedAt: null,
      trialEndsAt: null,
      trialConvertedAt: null,
      isTrialActive: false,
      daysRemaining: null,
      isExpired: false,
      subscriptionStatus: "active",
    };
  }

  const db = await getDb();
  const rows = await db.unsafe<Array<{
    trial_started_at: string | null;
    trial_ends_at: string | null;
    trial_converted_at: string | null;
    subscription_status: string;
    subscription_tier: string;
  }>>(
    `SELECT trial_started_at, trial_ends_at, trial_converted_at,
            subscription_status, subscription_tier
     FROM organizations WHERE id = $1`,
    [orgId],
  );

  if (rows.length === 0) {
    return {
      orgId,
      trialStartedAt: null,
      trialEndsAt: null,
      trialConvertedAt: null,
      isTrialActive: false,
      daysRemaining: null,
      isExpired: false,
      subscriptionStatus: "active",
    };
  }

  const row = rows[0];
  const now = new Date();
  const endsAt = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  const isExpired = endsAt ? endsAt <= now : false;
  const isTrialActive = !!(row.trial_started_at && !isExpired && !row.trial_converted_at);
  const daysRemaining = endsAt && isTrialActive ? Math.max(0, daysBetween(now, endsAt)) : null;

  return {
    orgId,
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    trialConvertedAt: row.trial_converted_at,
    isTrialActive,
    daysRemaining,
    isExpired,
    subscriptionStatus: row.subscription_status,
  };
}

export async function startTrial(orgId: string): Promise<TrialStatus> {
  const db = await getDb();
  const now = new Date();
  const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 86_400_000);

  await db.unsafe(
    `UPDATE organizations SET
       trial_started_at = $2,
       trial_ends_at = $3,
       subscription_status = 'trialing',
       subscription_tier = 'starter'
     WHERE id = $1`,
    [orgId, now.toISOString(), endsAt.toISOString()],
  );

  const session = getSession();
  recordAudit({
    orgId,
    userId: session?.userId ?? null,
    actionType: "TRIAL_STARTED",
    targetType: "organization",
    targetId: orgId,
    metadata: { trialEndsAt: endsAt.toISOString(), durationDays: TRIAL_DURATION_DAYS },
  }).catch(() => {});

  publishEvent(orgId, "trial:started", {
    trialStartedAt: now.toISOString(),
    trialEndsAt: endsAt.toISOString(),
  }).catch(() => {});

  logger.info("Trial started", {
    event: EVENTS.TRIAL_STARTED,
    orgId,
    trialEndsAt: endsAt.toISOString(),
  });

  return getTrialStatus(orgId);
}

export async function evaluateTrialAccess(orgId: string): Promise<TrialEvaluation> {
  const status = await getTrialStatus(orgId);

  if (status.subscriptionStatus === "active" && !status.isTrialActive && !status.isExpired) {
    return {
      status,
      showPaywall: false,
      blockAccess: false,
      message: null,
    };
  }

  if (status.subscriptionStatus === "suspended") {
    return {
      status,
      showPaywall: true,
      blockAccess: true,
      message: "Your account has been suspended. Please contact support.",
    };
  }

  if (status.trialConvertedAt) {
    return {
      status,
      showPaywall: false,
      blockAccess: false,
      message: null,
    };
  }

  if (status.isExpired) {
    logger.info("Trial expired", {
      event: EVENTS.TRIAL_EXPIRED,
      orgId,
      trialStartedAt: status.trialStartedAt,
      trialEndsAt: status.trialEndsAt,
    });

    return {
      status,
      showPaywall: true,
      blockAccess: true,
      message: `Your ${TRIAL_DURATION_DAYS}-day free trial has ended. Subscribe to continue using Kay's Wellness Centre.`,
    };
  }

  if (status.isTrialActive && status.daysRemaining !== null && status.daysRemaining <= 3) {
    logger.info("Trial expiring soon", {
      event: EVENTS.TRIAL_EXPIRING,
      orgId,
      daysRemaining: status.daysRemaining,
    });

    return {
      status,
      showPaywall: false,
      blockAccess: false,
      message: `Your free trial expires in ${status.daysRemaining} day${status.daysRemaining === 1 ? "" : "s"}. Upgrade now to keep full access.`,
    };
  }

  if (status.isTrialActive) {
    return {
      status,
      showPaywall: false,
      blockAccess: false,
      message: null,
    };
  }

  return {
    status,
    showPaywall: false,
    blockAccess: false,
    message: null,
  };
}

export async function convertTrial(orgId: string, targetTier: string): Promise<TrialStatus> {
  const db = await getDb();
  const now = new Date();

  await db.unsafe(
    `UPDATE organizations SET
       trial_converted_at = $2,
       subscription_status = 'active',
       subscription_tier = $3,
       subscription_expires_at = NULL
     WHERE id = $1`,
    [orgId, now.toISOString(), targetTier],
  );

  const session = getSession();
  recordAudit({
    orgId,
    userId: session?.userId ?? null,
    actionType: "TRIAL_CONVERTED",
    targetType: "organization",
    targetId: orgId,
    metadata: { convertedAt: now.toISOString(), targetTier },
  }).catch(() => {});

  publishEvent(orgId, "trial:converted", {
    convertedAt: now.toISOString(),
    targetTier,
  }).catch(() => {});

  logger.info("Trial converted", {
    event: EVENTS.TRIAL_CONVERTED,
    orgId,
    targetTier,
  });

  return getTrialStatus(orgId);
}

export async function getTrialsExpiringSoon(withinDays: number = 3): Promise<Array<{
  orgId: string;
  trialEndsAt: string;
  daysRemaining: number;
}>> {
  if (!isDbAvailable()) return [];

  const db = await getDb();
  const rows = await db.unsafe<Array<{
    id: string;
    trial_ends_at: string;
  }>>(
    `SELECT id, trial_ends_at FROM organizations
     WHERE trial_ends_at IS NOT NULL
       AND trial_converted_at IS NULL
       AND subscription_status = 'trialing'
       AND trial_ends_at BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + ($1 || ' days')::INTERVAL
     ORDER BY trial_ends_at ASC`,
    [String(withinDays)],
  );

  const now = new Date();
  return rows.map((r) => ({
    orgId: r.id,
    trialEndsAt: r.trial_ends_at,
    daysRemaining: Math.max(0, daysBetween(now, new Date(r.trial_ends_at))),
  }));
}
