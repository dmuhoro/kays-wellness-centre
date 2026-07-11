import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Webhook,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getWebhooks, getWebhookDeliveries, getDeliveryStats, retryPendingDeliveries } from "@/lib/webhooks.server";

export const Route = createFileRoute("/admin/settings/developer")({
  head: () => ({
    meta: [
      { title: "Developer — Webhooks & Integrations — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DeveloperPage,
});

type Tab = "webhooks" | "deliveries" | "stats";

function DeveloperContent() {
  const [tab, setTab] = useState<Tab>("deliveries");
  const [webhooks, setWebhooks] = useState<Array<{ id: number; url: string; events: string[]; active: boolean; created_at: string }>>([]);
  const [deliveries, setDeliveries] = useState<Array<{ id: number; event_type: string; status: string; response_code: number | null; response_time_ms: number | null; error_message: string | null; retry_count: number; created_at: string; payload: Record<string, unknown> }>>([]);
  const [stats, setStats] = useState({ total: 0, success: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [whResult, delResult, statResult] = await Promise.all([
        getWebhooks({}).catch(() => ({ status: "error" as const, webhooks: [] })),
        getWebhookDeliveries({ data: { limit: 20, offset: page * 20, status: filterStatus || undefined } }).catch(() => ({ status: "error" as const, deliveries: [] })),
        getDeliveryStats({}).catch(() => ({ status: "error" as const, stats: { total: 0, success: 0, failed: 0, pending: 0 } })),
      ]);

      if (whResult.status === "ok" && "webhooks" in whResult) setWebhooks((whResult as { webhooks: typeof webhooks }).webhooks);
      if (delResult.status === "ok" && "deliveries" in delResult) setDeliveries((delResult as { deliveries: typeof deliveries }).deliveries);
      if (statResult.status === "ok" && "stats" in statResult) setStats((statResult as { stats: typeof stats }).stats);
    } catch {
      // Silent fallback
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryPendingDeliveries({});
      await fetchData();
    } finally {
      setRetrying(false);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle className="size-4 text-emerald-500" />;
      case "failed": return <XCircle className="size-4 text-red-500" />;
      case "retrying": return <RefreshCw className="size-4 text-amber-500 animate-spin" />;
      case "pending": return <Clock className="size-4 text-sky-500" />;
      default: return <AlertTriangle className="size-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {(["webhooks", "deliveries", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "webhooks" ? "Webhook Endpoints" : t === "deliveries" ? "Delivery Log" : "Statistics"}
          </button>
        ))}
      </div>

      {/* Webhooks Tab */}
      {tab === "webhooks" && (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : webhooks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Webhook className="size-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No webhook endpoints configured yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Use the API to register webhooks for your clinic.</p>
            </div>
          ) : (
            webhooks.map((wh) => (
              <div key={wh.id} className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${wh.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                      <code className="text-xs font-mono truncate max-w-md">{wh.url}</code>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {wh.events.map((ev) => (
                        <span key={ev} className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(wh.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Deliveries Tab */}
      {tab === "deliveries" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {["", "success", "failed", "retrying", "pending"].map((s) => (
                <button
                  key={s}
                  onClick={() => { setFilterStatus(s); setPage(0); }}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    filterStatus === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {retrying ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              Retry Pending
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : deliveries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Webhook className="size-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No webhook deliveries recorded yet.</p>
            </div>
          ) : (
            deliveries.map((d) => (
              <div key={d.id} className="rounded-xl border border-border overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                  className="w-full p-4 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
                >
                  {statusIcon(d.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono font-medium">{d.event_type}</code>
                      {d.response_code && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          d.response_code < 300 ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                        }`}>
                          {d.response_code}
                        </span>
                      )}
                      {d.response_time_ms != null && (
                        <span className="text-[10px] text-muted-foreground">{d.response_time_ms}ms</span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(d.created_at).toLocaleString()} · Retry {d.retry_count}/{d.retry_count}
                    </div>
                  </div>
                  {expandedId === d.id ? <EyeOff className="size-3.5 text-muted-foreground" /> : <Eye className="size-3.5 text-muted-foreground" />}
                </button>
                {expandedId === d.id && (
                  <div className="border-t border-border bg-muted/20 p-4">
                    {d.error_message && (
                      <div className="mb-3 rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                        <p className="text-xs text-red-600 font-mono">{d.error_message}</p>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground mb-1.5">Payload</div>
                    <pre className="text-[10px] bg-secondary/40 rounded-lg p-3 overflow-x-auto max-h-40 font-mono">
                      {JSON.stringify(d.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="size-3" /> Prev
            </button>
            <span className="text-[10px] text-muted-foreground">Page {page + 1}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={deliveries.length < 20}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-30"
            >
              Next <ChevronRight className="size-3" />
            </button>
          </div>
        </div>
      )}

      {/* Stats Tab */}
      {tab === "stats" && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Deliveries", value: stats.total, icon: Webhook, color: "text-primary" },
            { label: "Successful", value: stats.success, icon: CheckCircle, color: "text-emerald-500" },
            { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-500" },
            { label: "Pending / Retrying", value: stats.pending, icon: Clock, color: "text-amber-500" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`size-4 ${s.color}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeveloperPage() {
  return (
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="size-6" /> Developer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Webhook endpoints, delivery history, and integration diagnostics.
          </p>
        </div>
        <DeveloperContent />
      </div>
    </div>
  );
}
