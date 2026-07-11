import { getDb, isDbAvailable, getConcurrentLock, releaseConcurrentLock } from "./db.server";
import { logger, EVENTS } from "./logger.server";
import { recordAudit } from "./audit.server";
import { getSession } from "./session.server";
import { publishEvent } from "./event-bus.server";
import {
  SUBSCRIPTION_TIERS,
  type SubscriptionTierId,
  getTierConfig,
} from "./subscriptions.server";

export type PaymentProvider = "mpesa" | "card" | "bank_transfer";
export type CheckoutStatus = "pending" | "processing" | "completed" | "failed" | "expired";

export interface CheckoutSession {
  id: string;
  organizationId: string;
  targetTier: SubscriptionTierId;
  paymentProvider: PaymentProvider;
  amountKes: number;
  status: CheckoutStatus;
  externalRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  completedAt: string | null;
}

export interface CheckoutInitiation {
  sessionId: string;
  checkoutUrl: string | null;
  paymentRef: string;
  amountKes: number;
  targetTier: SubscriptionTierId;
  provider: PaymentProvider;
  status: CheckoutStatus;
}

export interface WebhookReceiptMapping {
  provider: PaymentProvider;
  externalRef: string;
  amountKes: number;
  status: "success" | "failed";
  rawPayload: Record<string, unknown>;
}

const CHECKOUT_SESSION_TTL_MS = 30 * 60 * 1000;

function generateCheckoutId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `chk_${ts}_${rand}`;
}

function generatePaymentRef(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `pay_${ts}_${rand}`;
}

function buildCheckoutUrl(session: CheckoutSession): string {
  const base = process.env.APP_URL || "https://app.kayswellness.co.ke";
  return `${base}/api/checkout/${session.id}`;
}

export async function initiateCheckout(
  orgId: string,
  targetTier: SubscriptionTierId,
  provider: PaymentProvider,
): Promise<CheckoutInitiation> {
  const tierConfig = getTierConfig(targetTier);
  if (!tierConfig) throw new Error(`Invalid target tier: ${targetTier}`);

  const sessionId = generateCheckoutId();
  const paymentRef = generatePaymentRef();
  const db = await getDb();

  const lockKey = `checkout:${orgId}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) throw new Error("Could not acquire checkout lock");

  try {
    const existing = await db.unsafe<Array<{ id: string; status: string }>>(
      `SELECT id, status FROM checkout_sessions
       WHERE organization_id = $1 AND status IN ('pending', 'processing')
       AND target_tier = $2`,
      [orgId, targetTier],
    );
    if (existing.length > 0) {
      return {
        sessionId: existing[0].id,
        checkoutUrl: buildCheckoutUrl({ id: existing[0].id } as CheckoutSession),
        paymentRef,
        amountKes: tierConfig.price_monthly_kes,
        targetTier,
        provider,
        status: existing[0].status as CheckoutStatus,
      };
    }

    await db.unsafe(
      `INSERT INTO checkout_sessions
         (id, organization_id, target_tier, payment_provider, amount_kes, status, external_ref, metadata, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
      [
        sessionId,
        orgId,
        targetTier,
        provider,
        tierConfig.price_monthly_kes,
        paymentRef,
        JSON.stringify({ initiatedBy: getSession()?.userId ?? null }),
        new Date(Date.now() + CHECKOUT_SESSION_TTL_MS).toISOString(),
      ],
    );

    const session = getSession();
    recordAudit({
      orgId,
      userId: session?.userId ?? null,
      actionType: "CHECKOUT_CREATED",
      targetType: "checkout_session",
      targetId: sessionId,
      metadata: { targetTier, provider, amountKes: tierConfig.price_monthly_kes },
    }).catch(() => {});

    publishEvent(orgId, "checkout:initiated", {
      sessionId,
      targetTier,
      provider,
      amountKes: tierConfig.price_monthly_kes,
    }).catch(() => {});

    logger.info("Checkout session created", {
      event: EVENTS.CHECKOUT_CREATED,
      orgId,
      sessionId,
      targetTier,
      provider,
      amountKes: tierConfig.price_monthly_kes,
    });

    return {
      sessionId,
      checkoutUrl: buildCheckoutUrl({ id: sessionId } as CheckoutSession),
      paymentRef,
      amountKes: tierConfig.price_monthly_kes,
      targetTier,
      provider,
      status: "pending",
    };
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

export async function processWebhookReceipt(
  receipt: WebhookReceiptMapping,
): Promise<{ activated: boolean; orgId?: string; tier?: SubscriptionTierId }> {
  const db = await getDb();

  const rows = await db.unsafe<Array<{
    id: string;
    organization_id: string;
    target_tier: string;
    status: string;
  }>>(
    `SELECT id, organization_id, target_tier, status FROM checkout_sessions
     WHERE external_ref = $1 AND payment_provider = $2`,
    [receipt.externalRef, receipt.provider],
  );

  if (rows.length === 0) {
    logger.warn("Webhook receipt for unknown checkout", {
      event: EVENTS.CHECKOUT_FAILED,
      externalRef: receipt.externalRef,
      provider: receipt.provider,
    });
    return { activated: false };
  }

  const checkout = rows[0];
  if (checkout.status === "completed") {
    return { activated: false, orgId: checkout.organization_id, tier: checkout.target_tier as SubscriptionTierId };
  }

  const lockKey = `checkout_activate:${checkout.id}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) return { activated: false };

  try {
    if (receipt.status === "success") {
      await db.unsafe(
        `UPDATE checkout_sessions SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [checkout.id],
      );

      const tier = checkout.target_tier as SubscriptionTierId;
      await db.unsafe(
        `UPDATE organizations SET
           subscription_tier = $2,
           subscription_status = 'active',
           subscription_expires_at = NULL,
           trial_converted_at = COALESCE(trial_converted_at, CURRENT_TIMESTAMP)
         WHERE id = $1`,
        [checkout.organization_id, tier],
      );

      const session = getSession();
      recordAudit({
        orgId: checkout.organization_id,
        userId: session?.userId ?? null,
        actionType: "TIER_ACTIVATED",
        targetType: "organization",
        targetId: checkout.organization_id,
        metadata: { tier, checkoutId: checkout.id, provider: receipt.provider },
      }).catch(() => {});

      publishEvent(checkout.organization_id, "subscription:activated", {
        tier,
        checkoutId: checkout.id,
      }).catch(() => {});

      logger.info("Tier activated via webhook", {
        event: EVENTS.TIER_ACTIVATED,
        orgId: checkout.organization_id,
        tier,
        checkoutId: checkout.id,
      });

      return { activated: true, orgId: checkout.organization_id, tier };
    } else {
      await db.unsafe(
        `UPDATE checkout_sessions SET status = 'failed', metadata = metadata || $2 WHERE id = $1`,
        [checkout.id, JSON.stringify({ failureReason: receipt.rawPayload })],
      );

      logger.info("Checkout failed via webhook", {
        event: EVENTS.CHECKOUT_FAILED,
        orgId: checkout.organization_id,
        checkoutId: checkout.id,
      });

      return { activated: false, orgId: checkout.organization_id };
    }
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

export async function activateTier(
  orgId: string,
  targetTier: SubscriptionTierId,
): Promise<{ success: boolean; previousTier: string }> {
  const db = await getDb();
  const lockKey = `tier_activate:${orgId}`;
  const acquired = await getConcurrentLock(lockKey);
  if (!acquired) throw new Error("Could not acquire tier activation lock");

  try {
    const rows = await db.unsafe<Array<{ subscription_tier: string }>>(
      `SELECT subscription_tier FROM organizations WHERE id = $1 FOR UPDATE`,
      [orgId],
    );
    const previousTier = rows[0]?.subscription_tier ?? "starter";

    await db.unsafe(
      `UPDATE organizations SET
         subscription_tier = $2,
         subscription_status = 'active',
         subscription_expires_at = NULL,
         trial_converted_at = COALESCE(trial_converted_at, CURRENT_TIMESTAMP)
       WHERE id = $1`,
      [orgId, targetTier],
    );

    const session = getSession();
    recordAudit({
      orgId,
      userId: session?.userId ?? null,
      actionType: "TIER_ACTIVATED",
      targetType: "organization",
      targetId: orgId,
      metadata: { previousTier, targetTier, directActivation: true },
    }).catch(() => {});

    publishEvent(orgId, "subscription:activated", {
      tier: targetTier,
      previousTier,
    }).catch(() => {});

    logger.info("Tier activated directly", {
      event: EVENTS.TIER_ACTIVATED,
      orgId,
      previousTier,
      targetTier,
    });

    return { success: true, previousTier };
  } finally {
    await releaseConcurrentLock(lockKey);
  }
}

export async function getCheckoutSession(
  orgId: string,
  sessionId: string,
): Promise<CheckoutSession | null> {
  if (!isDbAvailable()) return null;
  const db = await getDb();
  const rows = await db.unsafe<Array<Record<string, unknown>>>(
    `SELECT id, organization_id, target_tier, payment_provider, amount_kes,
            status, external_ref, metadata, created_at, completed_at
     FROM checkout_sessions
     WHERE id = $1 AND organization_id = $2`,
    [sessionId, orgId],
  );

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    targetTier: r.target_tier as SubscriptionTierId,
    paymentProvider: r.payment_provider as PaymentProvider,
    amountKes: Number(r.amount_kes),
    status: r.status as CheckoutStatus,
    externalRef: r.external_ref as string | null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | null,
  };
}

export async function getCheckoutHistory(
  orgId: string,
  limit = 20,
): Promise<CheckoutSession[]> {
  if (!isDbAvailable()) return [];
  const db = await getDb();
  const rows = await db.unsafe<Array<Record<string, unknown>>>(
    `SELECT id, organization_id, target_tier, payment_provider, amount_kes,
            status, external_ref, metadata, created_at, completed_at
     FROM checkout_sessions
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [orgId, limit],
  );

  return rows.map((r) => ({
    id: r.id as string,
    organizationId: r.organization_id as string,
    targetTier: r.target_tier as SubscriptionTierId,
    paymentProvider: r.payment_provider as PaymentProvider,
    amountKes: Number(r.amount_kes),
    status: r.status as CheckoutStatus,
    externalRef: r.external_ref as string | null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | null,
  }));
}
