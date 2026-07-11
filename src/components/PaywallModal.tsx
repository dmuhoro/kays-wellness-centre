"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, X } from "lucide-react";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTier: string;
  requiredFeature?: string;
  usage?: {
    leads_used: number;
    leads_limit: number;
    leads_pct: number;
    storage_used_bytes: number;
    storage_limit_bytes: number;
    storage_pct: number;
    users_used: number;
    users_limit: number;
    users_pct: number;
  } | null;
}

const TIER_FEATURES: Record<string, { name: string; price: string; features: string[] }> = {
  starter: {
    name: "Starter",
    price: "Free",
    features: [
      "Up to 500 active leads",
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
      "Up to 5,000 active leads",
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
      "Dedicated account manager",
    ],
  },
};

const TIER_ORDER = ["starter", "growth", "enterprise"];

export function PaywallModal({
  open,
  onOpenChange,
  currentTier,
  requiredFeature,
  usage,
}: PaywallModalProps) {
  const currentTierIdx = TIER_ORDER.indexOf(currentTier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Upgrade Required
            {requiredFeature && (
              <Badge variant="secondary" className="text-xs">
                {requiredFeature.replace(/_/g, " ")}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Choose a plan that includes the features you need
          </DialogDescription>
        </DialogHeader>

        {usage && (
          <div className="rounded-lg bg-muted/50 p-4 mb-4">
            <h4 className="text-sm font-medium mb-2">Current Usage</h4>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Leads</span>
                <p className="font-medium">{usage.leads_used.toLocaleString()} / {usage.leads_limit.toLocaleString()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Storage</span>
                <p className="font-medium">{usage.storage_used_bytes >= 1024 * 1024 * 1024
                  ? `${(usage.storage_used_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
                  : `${(usage.storage_used_bytes / (1024 * 1024)).toFixed(1)} MB`
                } / ${usage.storage_limit_bytes >= 1024 * 1024 * 1024
                  ? `${(usage.storage_limit_bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`
                  : `${(usage.storage_limit_bytes / (1024 * 1024)).toFixed(0)} MB`
                }</p>
              </div>
              <div>
                <span className="text-muted-foreground">Users</span>
                <p className="font-medium">{usage.users_used} / {usage.users_limit}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          {TIER_ORDER.map((tierId, idx) => {
            const tier = TIER_FEATURES[tierId];
            const isCurrent = tierId === currentTier;
            const isUpgrade = idx > currentTierIdx;

            return (
              <div
                key={tierId}
                className={`relative rounded-xl border p-4 transition-all ${
                  isCurrent
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : isUpgrade
                      ? "border-border hover:border-primary/50 hover:bg-primary/5"
                      : "border-border bg-muted/30 opacity-60"
                }`}
              >
                {isCurrent && (
                  <Badge className="absolute -top-2 left-4 text-[10px]">Current</Badge>
                )}
                <h3 className="font-semibold text-sm">{tier.name}</h3>
                <p className="text-xl font-bold mt-1">{tier.price}</p>
                <ul className="mt-3 space-y-1.5">
                  {tier.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3 text-green-500 shrink-0" />
                      {feat}
                    </li>
                  ))}
                </ul>
                {isUpgrade && (
                  <button
                    onClick={() => onOpenChange(false)}
                    className="mt-4 w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Contact Sales
                  </button>
                )}
                {isCurrent && (
                  <div className="mt-4 text-center text-xs text-muted-foreground">
                    Your current plan
                  </div>
                )}
                {!isCurrent && !isUpgrade && (
                  <div className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <X className="size-3" />
                    Not available
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
