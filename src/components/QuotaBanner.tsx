"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, HardDrive, Users, Contact } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getUsage } from "@/lib/api/subscription.server";

interface QuotaBannerProps {
  showAlways?: boolean;
  warningThreshold?: number;
}

export function QuotaBanner({ showAlways = false, warningThreshold = 80 }: QuotaBannerProps) {
  const { data: usageResult, isLoading } = useQuery({
    queryKey: ["usage"],
    queryFn: () => getUsage(),
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading || !usageResult || usageResult.status !== "ok" || !usageResult.usage) {
    return null;
  }

  const { usage } = usageResult;
  const quotas = [
    {
      label: "Leads",
      icon: Contact,
      used: usage.leads_used,
      limit: usage.leads_limit,
      pct: usage.leads_pct,
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Storage",
      icon: HardDrive,
      used: usage.storage_used_bytes,
      limit: usage.storage_limit_bytes,
      pct: usage.storage_pct,
      format: (v: number) =>
        v >= 1024 * 1024 * 1024
          ? `${(v / (1024 * 1024 * 1024)).toFixed(1)} GB`
          : `${(v / (1024 * 1024)).toFixed(1)} MB`,
    },
    {
      label: "Users",
      icon: Users,
      used: usage.users_used,
      limit: usage.users_limit,
      pct: usage.users_pct,
      format: (v: number) => String(v),
    },
  ];

  const warnings = quotas.filter((q) => q.pct >= warningThreshold);
  const hasWarning = warnings.length > 0;

  if (!showAlways && !hasWarning) {
    return null;
  }

  return (
    <div
      className={`rounded-xl border p-4 ${
        hasWarning
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        {hasWarning && <AlertTriangle className="size-4 text-amber-600" />}
        <h3 className="text-sm font-medium">
          {hasWarning ? "Usage Limits — Action Required" : "Usage Overview"}
        </h3>
      </div>

      <div className="space-y-3">
        {quotas.map((quota) => {
          const Icon = quota.icon;
          const isHigh = quota.pct >= warningThreshold;
          const isCritical = quota.pct >= 95;

          return (
            <div key={quota.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <Icon className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{quota.label}</span>
                </div>
                <span className={`text-xs font-medium ${isCritical ? "text-red-600" : isHigh ? "text-amber-600" : "text-muted-foreground"}`}>
                  {quota.format(quota.used)} / {quota.format(quota.limit)}
                </span>
              </div>
              <Progress
                value={quota.pct}
                className={`h-1.5 ${
                  isCritical
                    ? "[&>div]:bg-red-500"
                    : isHigh
                      ? "[&>div]:bg-amber-500"
                      : ""
                }`}
              />
            </div>
          );
        })}
      </div>

      {hasWarning && (
        <p className="mt-3 text-xs text-muted-foreground">
          Consider upgrading your plan to increase your limits.
        </p>
      )}
    </div>
  );
}
