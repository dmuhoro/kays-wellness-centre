import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, CreditCard,
  HardDrive, Users, Contact, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { getSubscription, refreshUsage } from "@/lib/api/subscription.server";
import { formatBytes } from "@/lib/metering.server";

export const Route = createFileRoute("/admin/settings/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Usage — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: BillingPage,
});

const TIER_FEATURES: Record<string, { name: string; price: string; features: string[] }> = {
  starter: {
    name: "Starter",
    price: "Free",
    features: [
      "500 active leads",
      "5 GB storage",
      "3 staff users",
      "WhatsApp automation",
      "Email reminders",
      "Lead pipeline",
      "Basic scheduling",
    ],
  },
  growth: {
    name: "Growth",
    price: "$49/mo",
    features: [
      "5,000 active leads",
      "25 GB storage",
      "10 staff users",
      "Advanced analytics",
      "Bulk operations",
      "SMS follow-ups",
      "Custom branding",
      "Web forms",
      "Priority email support",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: "$149/mo",
    features: [
      "Unlimited leads",
      "100 GB storage",
      "Unlimited users",
      "Multi-location",
      "API access",
      "Audit log",
      "Priority support",
      "Custom integrations",
      "SLA guarantee",
    ],
  },
};

const TIER_ORDER = ["starter", "growth", "enterprise"];

function BillingContent() {
  const queryClient = useQueryClient();
  const { data: subResult, isLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => getSubscription(),
  });

  const [refreshing, setRefreshing] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (!subResult || subResult.status !== "ok") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground">Unable to load subscription data</p>
      </div>
    );
  }

  const { tier, subscriptionStatus, expiresAt, usage } = subResult;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUsage();
      queryClient.invalidateQueries({ queryKey: ["subscription"] });
      queryClient.invalidateQueries({ queryKey: ["usage"] });
    } finally {
      setRefreshing(false);
    }
  };

  const currentTierIdx = TIER_ORDER.indexOf(tier);
  const currentTierDef = TIER_FEATURES[tier];

  const allFeatures = [
    { key: "leads", label: "Active Leads", icon: Contact },
    { key: "storage", label: "Storage", icon: HardDrive },
    { key: "users", label: "Staff Users", icon: Users },
  ];

  return (
    <div className="space-y-8">
      {/* Current Plan */}
      <section className="glass rounded-2xl p-6 border-warm">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Current Plan</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your subscription details and renewal information
            </p>
          </div>
          <Badge variant={subscriptionStatus === "active" ? "default" : "destructive"}>
            {subscriptionStatus === "active" ? "Active" : subscriptionStatus === "past_due" ? "Past Due" : "Suspended"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-muted-foreground">Plan</span>
            <p className="text-xl font-bold">{currentTierDef.name}</p>
            <p className="text-sm text-muted-foreground">{currentTierDef.price}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Status</span>
            <p className="flex items-center gap-1.5 mt-1">
              {subscriptionStatus === "active" ? (
                <><CheckCircle2 className="size-4 text-green-500" /> <span className="font-medium">Active</span></>
              ) : (
                <><XCircle className="size-4 text-red-500" /> <span className="font-medium">{subscriptionStatus === "past_due" ? "Past Due" : "Suspended"}</span></>
              )}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Renewal</span>
            <p className="font-medium mt-1">
              {expiresAt
                ? new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                : "No expiry (free tier)"}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            <CreditCard className="size-4" />
            {tier === "starter" ? "Upgrade Plan" : "Manage Subscription"}
          </button>
        </div>
      </section>

      {/* Usage Meters */}
      <section className="glass rounded-2xl p-6 border-warm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Usage</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Current resource consumption against your plan limits
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {usage && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {/* Leads */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Contact className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Active Leads</span>
              </div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-bold">{usage.leads_used.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">of {usage.leads_limit.toLocaleString()}</span>
              </div>
              <Progress
                value={usage.leads_pct}
                className={`h-2 ${usage.leads_pct >= 95 ? "[&>div]:bg-red-500" : usage.leads_pct >= 80 ? "[&>div]:bg-amber-500" : ""}`}
              />
              <p className="text-xs text-muted-foreground mt-1">{usage.leads_pct}% used</p>
            </div>

            {/* Storage */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Storage</span>
              </div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-bold">{formatBytes(usage.storage_used_bytes)}</span>
                <span className="text-xs text-muted-foreground">of {formatBytes(usage.storage_limit_bytes)}</span>
              </div>
              <Progress
                value={usage.storage_pct}
                className={`h-2 ${usage.storage_pct >= 95 ? "[&>div]:bg-red-500" : usage.storage_pct >= 80 ? "[&>div]:bg-amber-500" : ""}`}
              />
              <p className="text-xs text-muted-foreground mt-1">{usage.storage_pct}% used</p>
            </div>

            {/* Users */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Staff Users</span>
              </div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-2xl font-bold">{usage.users_used}</span>
                <span className="text-xs text-muted-foreground">of {usage.users_limit}</span>
              </div>
              <Progress
                value={usage.users_pct}
                className={`h-2 ${usage.users_pct >= 95 ? "[&>div]:bg-red-500" : usage.users_pct >= 80 ? "[&>div]:bg-amber-500" : ""}`}
              />
              <p className="text-xs text-muted-foreground mt-1">{usage.users_pct}% used</p>
            </div>
          </div>
        )}
      </section>

      {/* Tier Comparison */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Plan Comparison</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TIER_ORDER.map((tierId, idx) => {
            const tierDef = TIER_FEATURES[tierId];
            const isCurrent = tierId === tier;
            const isUpgrade = idx > currentTierIdx;

            return (
              <Card
                key={tierId}
                className={`relative ${
                  isCurrent
                    ? "border-primary ring-1 ring-primary/20"
                    : isUpgrade
                      ? "hover:border-primary/50"
                      : "opacity-60"
                }`}
              >
                {isCurrent && (
                  <Badge className="absolute -top-2 left-4 text-[10px]">Current Plan</Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-base">{tierDef.name}</CardTitle>
                  <CardDescription className="text-lg font-bold text-foreground">
                    {tierDef.price}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {tierDef.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 size-3.5 text-green-500 shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <div className="w-full text-center text-xs text-muted-foreground">
                      Your current plan
                    </div>
                  ) : isUpgrade ? (
                    <button className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                      Upgrade
                    </button>
                  ) : (
                    <div className="w-full text-center text-xs text-muted-foreground">
                      Downgrade
                    </div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function BillingPage() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center gap-4">
            <Link
              to="/admin/triage"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to triage
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold">Billing & Usage</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your subscription, monitor usage, and compare plans.
            </p>
          </div>

          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin" /></div>}>
            <BillingContent />
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
}
