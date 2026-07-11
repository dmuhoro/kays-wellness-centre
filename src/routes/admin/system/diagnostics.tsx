import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Shield, ArrowLeft, Bell, Activity, Loader2, RefreshCw,
  AlertCircle, CheckCircle, XCircle, Database, Clock,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getServerStatus, getQueueTelemetry, forceRetryQueueItems, getFailedQueueItems } from "@/lib/api/diagnostics.server";

export const Route = createFileRoute("/admin/system/diagnostics")({
  head: () => ({
    meta: [
      { title: "System Diagnostics — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SystemDiagnosticsPage,
});

function SystemDiagnosticsPage() {
  const queryClient = useQueryClient();
  const [dbStatus, setDbStatus] = useState<"checking" | "available" | "unavailable">("checking");

  useEffect(() => {
    getServerStatus({}).then((s) => setDbStatus(s.dbAvailable ? "available" : "unavailable"));
  }, []);

  const { data: telemetry, isLoading: telemetryLoading } = useQuery({
    queryKey: ["queue-telemetry"],
    queryFn: () => getQueueTelemetry({}),
    refetchInterval: 15_000,
  });

  const { data: failedItems, isLoading: failedLoading } = useQuery({
    queryKey: ["queue-failed"],
    queryFn: () => getFailedQueueItems({}),
    refetchInterval: 15_000,
  });

  const retryMutation = useMutation({
    mutationFn: () => forceRetryQueueItems({ data: { maxItems: 25 } }),
    onSuccess: (result) => {
      toast.success(`Force retry initiated`, {
        description: `${result.retried} items moved to pending`,
      });
      queryClient.invalidateQueries({ queryKey: ["queue-telemetry"] });
      queryClient.invalidateQueries({ queryKey: ["queue-failed"] });
    },
    onError: (err) => {
      toast.error("Force retry failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const stalledCount = (telemetry?.stalled ?? 0) + (telemetry?.failed ?? 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/triage"
              className="size-8 rounded-lg gradient-hero flex items-center justify-center"
            >
              <Shield className="size-4 text-primary-foreground" />
            </Link>
            <div>
              <div className="font-bold text-sm">System Diagnostics</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Queue & Infrastructure Console
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dbStatus === "available" ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Database className="size-3" /> DB Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-amber-400/10 text-amber-600 border border-amber-400/20">
                <Database className="size-3" /> DB Offline
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Queue Telemetry Overview */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Bell className="size-4 text-sky-500" /> Notification Queue Telemetry
          </h2>
          {telemetryLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : telemetry ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
              <StatBox label="Total" value={telemetry.total} color="text-foreground" />
              <StatBox label="Pending" value={telemetry.pending} color="text-sky-500" />
              <StatBox label="Dispatched" value={telemetry.dispatched} color="text-emerald-500" />
              <StatBox label="Failed" value={telemetry.failed} color="text-red-500" />
              <StatBox label="Stalled" value={telemetry.stalled} color="text-amber-500" />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Queue telemetry unavailable.</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => retryMutation.mutate()}
              disabled={stalledCount === 0 || retryMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/10 text-amber-600 text-xs font-semibold hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
            >
              {retryMutation.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              Force Retry ({stalledCount} stalled/failed)
            </button>
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["queue-telemetry"] });
                queryClient.invalidateQueries({ queryKey: ["queue-failed"] });
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary/50 text-muted-foreground text-xs font-semibold hover:bg-secondary transition-colors"
            >
              <RefreshCw className="size-3" /> Refresh
            </button>
          </div>
        </div>

        {/* Failed Queue Items */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <AlertCircle className="size-4 text-red-500" /> Failed & Stalled Items
          </h2>
          {failedLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : failedItems && failedItems.items.length > 0 ? (
            <div className="space-y-2">
              {failedItems.items.map((item: Record<string, unknown>) => (
                <div key={item.id as number} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/10">
                  <XCircle className="size-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">#{item.id as number}</span>
                      <span className="text-muted-foreground">{item.event_type as string}</span>
                      <span className="text-muted-foreground">lead #{item.lead_id as number}</span>
                    </div>
                    <div className="text-[10px] text-red-600 mt-0.5 truncate">
                      {item.last_error as string || "No error detail"}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      Retries: {item.retry_count as number}/{item.max_retries as number} · Created: {new Date(item.created_at as string).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <CheckCircle className="size-8 mb-2 text-emerald-500" />
              <p className="text-xs font-semibold text-emerald-600">All clear</p>
              <p className="text-[10px] mt-0.5">No failed or stalled queue items.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-6">
          <Link to="/admin/triage" className="hover:text-primary inline-flex items-center gap-1.5">
            <ArrowLeft className="size-3" /> Return to Command Desk
          </Link>
          <p>Auto-refreshes every 15s</p>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-secondary/30 rounded-xl p-3 border border-border/50 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
