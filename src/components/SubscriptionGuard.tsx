"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lock } from "lucide-react";
import { getSubscription } from "@/lib/api/subscription.server";
import { PaywallModal } from "./PaywallModal";

interface SubscriptionGuardProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function SubscriptionGuard({ feature, children, fallback }: SubscriptionGuardProps) {
  const [showPaywall, setShowPaywall] = useState(false);

  const { data: subResult, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => getSubscription(),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return null;
  }

  if (!subResult || subResult.status !== "ok") {
    return <>{children}</>;
  }

  const { tier, subscriptionStatus, usage } = subResult;

  if (subscriptionStatus === "suspended") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-destructive shrink-0" />
          <div>
            <h3 className="font-semibold text-destructive">Account Suspended</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your subscription has been suspended. Please contact support to restore access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (subscriptionStatus === "past_due") {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 text-amber-600 shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-600">Payment Required</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your subscription is past due. Please update your payment method to continue.
            </p>
            <button
              onClick={() => setShowPaywall(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Update Payment
            </button>
          </div>
        </div>
      </div>
    );
  }

  const FEATURES: Record<string, { tier: string; label: string }> = {
    advanced_analytics: { tier: "growth", label: "Advanced Analytics" },
    whatsapp_integration: { tier: "growth", label: "WhatsApp Integration" },
    multi_location: { tier: "enterprise", label: "Multi-Location" },
    api_access: { tier: "enterprise", label: "API Access" },
    audit_log: { tier: "enterprise", label: "Audit Log" },
    custom_branding: { tier: "growth", label: "Custom Branding" },
    priority_support: { tier: "enterprise", label: "Priority Support" },
    bulk_operations: { tier: "growth", label: "Bulk Operations" },
    sms_followups: { tier: "growth", label: "SMS Follow-ups" },
    web_forms: { tier: "growth", label: "Web Forms" },
  };

  const TIER_LEVELS: Record<string, number> = {
    starter: 0,
    growth: 1,
    enterprise: 2,
  };

  const featureDef = FEATURES[feature];
  const requiredLevel = featureDef ? TIER_LEVELS[featureDef.tier] ?? 1 : 1;
  const currentLevel = TIER_LEVELS[tier] ?? 0;

  if (currentLevel >= requiredLevel) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <>
      <div
        className="relative cursor-pointer rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-6 transition-colors hover:border-primary/50 hover:bg-primary/5"
        onClick={() => setShowPaywall(true)}
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 rounded-full bg-muted p-2">
            <Lock className="size-5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">{featureDef?.label ?? feature}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Upgrade to {featureDef?.tier ?? "growth"} to access this feature
          </p>
        </div>
      </div>

      <PaywallModal
        open={showPaywall}
        onOpenChange={setShowPaywall}
        currentTier={tier}
        requiredFeature={feature}
        usage={usage}
      />
    </>
  );
}
