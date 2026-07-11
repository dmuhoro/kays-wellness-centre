import { createServerFn } from "@tanstack/react-start";
import { requireOrg } from "../tenant.server";
import { getOrgSubscription, listTiers, type SubscriptionTierId } from "../subscriptions.server";
import { getUsageSnapshot, checkQuota, refreshUsageCounters } from "../metering.server";
import { isDbAvailable, getConnectionError } from "../db.server";
import { logger, EVENTS } from "../logger.server";

export type SubscriptionTier = SubscriptionTierId;

export const getSubscription = createServerFn({ method: "GET" }).handler(async () => {
  if (!isDbAvailable()) {
    return {
      status: "db_unavailable" as const,
      tier: "starter" as SubscriptionTier,
      subscriptionStatus: "active" as const,
      usage: null,
    };
  }

  try {
    const { orgId } = requireOrg();
    const sub = await getOrgSubscription(orgId);
    const usage = await getUsageSnapshot(orgId);
    return {
      status: "ok" as const,
      tier: sub.tier,
      subscriptionStatus: sub.status,
      expiresAt: sub.expiresAt,
      usage,
    };
  } catch (err) {
    logger.error("Failed to fetch subscription", {
      event: EVENTS.CONFIG_UPDATED,
      error: (err as Error).message,
    });
    return {
      status: "error" as const,
      tier: "starter" as SubscriptionTier,
      subscriptionStatus: "active" as const,
      usage: null,
    };
  }
});

export const getUsage = createServerFn({ method: "GET" }).handler(async () => {
  if (!isDbAvailable()) {
    return { status: "db_unavailable" as const, usage: null };
  }

  try {
    const { orgId } = requireOrg();
    const usage = await getUsageSnapshot(orgId);
    return { status: "ok" as const, usage };
  } catch (err) {
    logger.error("Failed to fetch usage", {
      event: EVENTS.CONFIG_UPDATED,
      error: (err as Error).message,
    });
    return { status: "error" as const, usage: null };
  }
});

export const checkLeadQuota = createServerFn({ method: "GET" }).handler(async () => {
  if (!isDbAvailable()) {
    return { status: "db_unavailable" as const, withinQuota: true, used: 0, limit: 500 };
  }

  try {
    const { orgId } = requireOrg();
    const result = await checkQuota(orgId, "leads");
    return { status: "ok" as const, ...result };
  } catch (err) {
    return { status: "error" as const, withinQuota: true, used: 0, limit: 500 };
  }
});

export const checkStorageQuota = createServerFn({ method: "GET" })
  .validator((data: { additionalBytes?: number }) => data)
  .handler(async ({ data }) => {
    if (!isDbAvailable()) {
      return { status: "db_unavailable" as const, withinQuota: true, used: 0, limit: 5 * 1024 * 1024 * 1024 };
    }

    try {
      const { orgId } = requireOrg();
      const result = await checkQuota(orgId, "storage", data.additionalBytes);
      return { status: "ok" as const, ...result };
    } catch (err) {
      return { status: "error" as const, withinQuota: true, used: 0, limit: 5 * 1024 * 1024 * 1024 };
    }
  });

export const refreshUsage = createServerFn({ method: "POST" }).handler(async () => {
  if (!isDbAvailable()) {
    return { status: "db_unavailable" as const };
  }

  try {
    const { orgId } = requireOrg();
    await refreshUsageCounters(orgId);
    const usage = await getUsageSnapshot(orgId);
    return { status: "ok" as const, usage };
  } catch (err) {
    logger.error("Failed to refresh usage", {
      event: EVENTS.CONFIG_UPDATED,
      error: (err as Error).message,
    });
    return { status: "error" as const };
  }
});

export const getAvailableTiers = createServerFn({ method: "GET" }).handler(async () => {
  return listTiers();
});
