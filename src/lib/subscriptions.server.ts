import { getDb, isDbAvailable } from "./db.server";
import { requireOrg, TenantError } from "./tenant.server";
import { logger, EVENTS } from "./logger.server";

export const SUBSCRIPTION_TIERS = {
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "Front Desk Focus",
    price_monthly_kes: 4500,
    features: [
      "lead_pipeline",
      "scheduling",
      "whatsapp_basic",
      "notifications",
      "analytics_basic",
    ] as string[],
    limits: {
      max_active_leads: 500,
      max_storage_bytes: 5 * 1024 * 1024 * 1024, // 5 GB
      max_users: 3,
      max_providers: 5,
      max_locations: 1,
    },
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Mid-Sized Clinic",
    price_monthly_kes: 12000,
    features: [
      "lead_pipeline",
      "scheduling",
      "whatsapp_basic",
      "whatsapp_media",
      "notifications",
      "analytics",
      "analytics_advanced",
      "bulk_export",
      "automations",
      "audit_log",
    ] as string[],
    limits: {
      max_active_leads: 2000,
      max_storage_bytes: 20 * 1024 * 1024 * 1024, // 20 GB
      max_users: 10,
      max_providers: 20,
      max_locations: 1,
    },
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Multi-Location Dominator",
    price_monthly_kes: 35000,
    features: [
      "lead_pipeline",
      "scheduling",
      "whatsapp_basic",
      "whatsapp_media",
      "notifications",
      "analytics",
      "analytics_advanced",
      "bulk_export",
      "automations",
      "audit_log",
      "multi_location",
      "custom_branding",
      "priority_support",
      "data_api",
    ] as string[],
    limits: {
      max_active_leads: 10000,
      max_storage_bytes: 100 * 1024 * 1024 * 1024, // 100 GB
      max_users: 50,
      max_providers: 100,
      max_locations: 10,
    },
  },
} as const;

export type SubscriptionTierId = keyof typeof SUBSCRIPTION_TIERS;
export type FeatureId = (typeof SUBSCRIPTION_TIERS)["starter"]["features"][number];

export const SUBSCRIPTION_STATUSES = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  suspended: "suspended",
  cancelled: "cancelled",
} as const;

export type SubscriptionStatus = keyof typeof SUBSCRIPTION_STATUSES;

export interface OrgSubscription {
  tier: SubscriptionTierId;
  status: SubscriptionStatus;
  expiresAt: string | null;
  createdAt: string;
}

export function getTierConfig(tierId: SubscriptionTierId) {
  return SUBSCRIPTION_TIERS[tierId];
}

export function getTierFeatures(tierId: SubscriptionTierId): string[] {
  return [...SUBSCRIPTION_TIERS[tierId].features];
}

export function getTierLimits(tierId: SubscriptionTierId) {
  return { ...SUBSCRIPTION_TIERS[tierId].limits };
}

export function hasFeature(tierId: SubscriptionTierId, featureId: string): boolean {
  return SUBSCRIPTION_TIERS[tierId].features.includes(featureId);
}

export function listTiers() {
  return Object.values(SUBSCRIPTION_TIERS).map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    price_monthly_kes: t.price_monthly_kes,
    featureCount: t.features.length,
    limits: { ...t.limits },
  }));
}

export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  if (!isDbAvailable()) {
    return { tier: "starter", status: "active", expiresAt: null, createdAt: new Date().toISOString() };
  }

  const db = await getDb();
  const rows = await db.unsafe<Array<{
    subscription_tier: string | null;
    subscription_status: string | null;
    subscription_expires_at: string | null;
    created_at: string;
  }>>(
    `SELECT subscription_tier, subscription_status, subscription_expires_at, created_at
     FROM organizations WHERE id = $1`,
    [orgId],
  );

  if (rows.length === 0) {
    return { tier: "starter", status: "active", expiresAt: null, createdAt: new Date().toISOString() };
  }

  const row = rows[0];
  return {
    tier: (row.subscription_tier as SubscriptionTierId) || "starter",
    status: (row.subscription_status as SubscriptionStatus) || "active",
    expiresAt: row.subscription_expires_at,
    createdAt: row.created_at,
  };
}

export async function ensureFeatureAccess(featureId: string): Promise<void> {
  const { orgId, log } = requireOrg();
  const sub = await getOrgSubscription(orgId);

  if (sub.status === "suspended") {
    log.warn("Feature access denied — account suspended", {
      event: EVENTS.PERMISSION_DENIED,
      featureId,
      subscriptionStatus: sub.status,
    });
    throw new TenantError("Your account has been suspended. Please contact support.");
  }

  if (sub.status === "past_due") {
    log.warn("Feature access denied — past due", {
      event: EVENTS.PERMISSION_DENIED,
      featureId,
      subscriptionStatus: sub.status,
    });
    throw new TenantError("Your subscription is past due. Please update your payment method.");
  }

  if (!hasFeature(sub.tier, featureId)) {
    log.warn("Feature access denied — tier restriction", {
      event: EVENTS.PERMISSION_DENIED,
      featureId,
      tier: sub.tier,
    });
    throw new TenantError(
      `This feature requires a higher subscription tier. Current tier: ${SUBSCRIPTION_TIERS[sub.tier].name}.`,
    );
  }
}

export function checkFeatureAccessSync(
  tier: SubscriptionTierId,
  status: SubscriptionStatus,
  featureId: string,
): { allowed: boolean; reason?: string } {
  if (status === "suspended") {
    return { allowed: false, reason: "Account suspended" };
  }
  if (status === "past_due") {
    return { allowed: false, reason: "Subscription past due" };
  }
  if (!hasFeature(tier, featureId)) {
    return {
      allowed: false,
      reason: `Feature unavailable on ${SUBSCRIPTION_TIERS[tier].name} tier`,
    };
  }
  return { allowed: true };
}
