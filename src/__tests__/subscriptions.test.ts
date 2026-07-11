import { describe, it, expect } from "vitest";
import {
  SUBSCRIPTION_TIERS,
  getTierConfig,
  getTierFeatures,
  getTierLimits,
  hasFeature,
  listTiers,
  checkFeatureAccessSync,
  type SubscriptionTierId,
  type SubscriptionStatus,
} from "@/lib/subscriptions.server";

describe("SUBSCRIPTION_TIERS", () => {
  it("defines three tiers", () => {
    expect(Object.keys(SUBSCRIPTION_TIERS)).toHaveLength(3);
    expect(SUBSCRIPTION_TIERS.starter).toBeDefined();
    expect(SUBSCRIPTION_TIERS.growth).toBeDefined();
    expect(SUBSCRIPTION_TIERS.enterprise).toBeDefined();
  });

  it("starter has correct id", () => {
    expect(SUBSCRIPTION_TIERS.starter.id).toBe("starter");
  });

  it("growth has correct id", () => {
    expect(SUBSCRIPTION_TIERS.growth.id).toBe("growth");
  });

  it("enterprise has correct id", () => {
    expect(SUBSCRIPTION_TIERS.enterprise.id).toBe("enterprise");
  });

  it("starter has fewer features than growth", () => {
    expect(SUBSCRIPTION_TIERS.starter.features.length).toBeLessThan(
      SUBSCRIPTION_TIERS.growth.features.length,
    );
  });

  it("growth has fewer features than enterprise", () => {
    expect(SUBSCRIPTION_TIERS.growth.features.length).toBeLessThan(
      SUBSCRIPTION_TIERS.enterprise.features.length,
    );
  });

  it("starter has lower limits than growth", () => {
    expect(SUBSCRIPTION_TIERS.starter.limits.max_active_leads).toBeLessThan(
      SUBSCRIPTION_TIERS.growth.limits.max_active_leads,
    );
  });

  it("growth has lower limits than enterprise", () => {
    expect(SUBSCRIPTION_TIERS.growth.limits.max_active_leads).toBeLessThan(
      SUBSCRIPTION_TIERS.enterprise.limits.max_active_leads,
    );
  });

  it("all tiers have prices in KES", () => {
    for (const tier of Object.values(SUBSCRIPTION_TIERS)) {
      expect(tier.price_monthly_kes).toBeGreaterThan(0);
    }
  });
});

describe("getTierConfig", () => {
  it("returns the correct tier config", () => {
    const config = getTierConfig("starter");
    expect(config.id).toBe("starter");
    expect(config.name).toBe("Starter");
  });

  it("returns growth config", () => {
    const config = getTierConfig("growth");
    expect(config.id).toBe("growth");
    expect(config.name).toBe("Growth");
  });

  it("returns enterprise config", () => {
    const config = getTierConfig("enterprise");
    expect(config.id).toBe("enterprise");
    expect(config.name).toBe("Enterprise");
  });
});

describe("getTierFeatures", () => {
  it("returns an array of feature strings", () => {
    const features = getTierFeatures("starter");
    expect(Array.isArray(features)).toBe(true);
    features.forEach((f) => expect(typeof f).toBe("string"));
  });

  it("returns a copy, not the original array", () => {
    const features1 = getTierFeatures("starter");
    const features2 = getTierFeatures("starter");
    expect(features1).not.toBe(features2);
    expect(features1).toEqual(features2);
  });

  it("includes lead_pipeline for all tiers", () => {
    for (const tier of ["starter", "growth", "enterprise"] as SubscriptionTierId[]) {
      expect(getTierFeatures(tier)).toContain("lead_pipeline");
    }
  });
});

describe("getTierLimits", () => {
  it("returns an object with limit fields", () => {
    const limits = getTierLimits("starter");
    expect(limits).toHaveProperty("max_active_leads");
    expect(limits).toHaveProperty("max_storage_bytes");
    expect(limits).toHaveProperty("max_users");
    expect(limits).toHaveProperty("max_providers");
    expect(limits).toHaveProperty("max_locations");
  });

  it("returns a copy, not the original object", () => {
    const limits1 = getTierLimits("growth");
    const limits2 = getTierLimits("growth");
    expect(limits1).not.toBe(limits2);
    expect(limits1).toEqual(limits2);
  });

  it("starter max_active_leads is 500", () => {
    expect(getTierLimits("starter").max_active_leads).toBe(500);
  });

  it("growth max_users is 10", () => {
    expect(getTierLimits("growth").max_users).toBe(10);
  });

  it("enterprise max_locations is 10", () => {
    expect(getTierLimits("enterprise").max_locations).toBe(10);
  });
});

describe("hasFeature", () => {
  it("returns true for starter having lead_pipeline", () => {
    expect(hasFeature("starter", "lead_pipeline")).toBe(true);
  });

  it("returns true for growth having analytics_advanced", () => {
    expect(hasFeature("growth", "analytics_advanced")).toBe(true);
  });

  it("returns false for starter having multi_location", () => {
    expect(hasFeature("starter", "multi_location")).toBe(false);
  });

  it("returns true for enterprise having multi_location", () => {
    expect(hasFeature("enterprise", "multi_location")).toBe(true);
  });

  it("returns false for unknown feature", () => {
    expect(hasFeature("starter", "nonexistent_feature")).toBe(false);
  });
});

describe("listTiers", () => {
  it("returns an array of 3 tiers", () => {
    const tiers = listTiers();
    expect(tiers).toHaveLength(3);
  });

  it("each tier has id, name, price, featureCount, limits", () => {
    const tiers = listTiers();
    for (const tier of tiers) {
      expect(tier).toHaveProperty("id");
      expect(tier).toHaveProperty("name");
      expect(tier).toHaveProperty("price_monthly_kes");
      expect(tier).toHaveProperty("featureCount");
      expect(tier).toHaveProperty("limits");
      expect(typeof tier.featureCount).toBe("number");
      expect(tier.featureCount).toBeGreaterThan(0);
    }
  });

  it("returns tiers sorted by tier order", () => {
    const tiers = listTiers();
    expect(tiers[0].id).toBe("starter");
    expect(tiers[1].id).toBe("growth");
    expect(tiers[2].id).toBe("enterprise");
  });
});

describe("checkFeatureAccessSync", () => {
  it("allows active starter to access lead_pipeline", () => {
    const result = checkFeatureAccessSync("starter", "active", "lead_pipeline");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("denies suspended account", () => {
    const result = checkFeatureAccessSync("enterprise", "suspended", "lead_pipeline");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Account suspended");
  });

  it("denies past_due account", () => {
    const result = checkFeatureAccessSync("growth", "past_due", "scheduling");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Subscription past due");
  });

  it("denies starter accessing growth-only feature", () => {
    const result = checkFeatureAccessSync("starter", "active", "analytics_advanced");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Starter");
  });

  it("denies starter accessing enterprise-only feature", () => {
    const result = checkFeatureAccessSync("starter", "active", "multi_location");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Starter");
  });

  it("allows growth accessing growth-only feature", () => {
    const result = checkFeatureAccessSync("growth", "active", "analytics_advanced");
    expect(result.allowed).toBe(true);
  });

  it("allows enterprise accessing enterprise-only feature", () => {
    const result = checkFeatureAccessSync("enterprise", "active", "multi_location");
    expect(result.allowed).toBe(true);
  });

  it("allows trialing status", () => {
    const result = checkFeatureAccessSync("starter", "trialing", "lead_pipeline");
    expect(result.allowed).toBe(true);
  });

  it("allows cancelled status if not suspended", () => {
    const result = checkFeatureAccessSync("starter", "cancelled", "scheduling");
    expect(result.allowed).toBe(true);
  });
});
