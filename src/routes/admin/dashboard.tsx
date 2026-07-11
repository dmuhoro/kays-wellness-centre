import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, Suspense } from "react";
import {
  Shield,
  ArrowLeft,
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Activity,
  Clock,
  AlertTriangle,
  BarChart3,
  Loader2,
  RefreshCw,
  Receipt,
  Landmark,
  Percent,
  UserCheck,
} from "lucide-react";
import { getAnalytics } from "@/lib/api/analytics.server";
import { useAuth } from "@/hooks/useAuth";
import { NetworkStatus } from "@/components/NetworkStatus";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { canAccessFinance } from "@/lib/permissions.server";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AnalyticsSnapshot } from "@/lib/analytics.server";

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DashboardPage,
});

function StatCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sublabel?: string;
  color: string;
  accent: string;
}) {
  return (
    <div className="glass rounded-2xl border-warm p-5 animate-fade-up">
      <div className="flex items-center gap-3 mb-3">
        <div className={`size-10 rounded-xl ${accent} flex items-center justify-center`}>
          <Icon className={`size-5 ${color}`} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </div>
      {sublabel && (
        <div className="text-[11px] text-muted-foreground/70 border-t border-border/50 pt-2 mt-1">
          {sublabel}
        </div>
      )}
    </div>
  );
}

function StageBreakdownBar({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  const stages = [
    { key: "pending", label: "New", color: "bg-sky-500" },
    { key: "contacted", label: "Triage", color: "bg-amber-500" },
    { key: "scheduled", label: "Scheduled", color: "bg-emerald-500" },
    { key: "converted", label: "Checked-In", color: "bg-violet-500" },
    { key: "closed", label: "Dropped", color: "bg-gray-400" },
  ];

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return (
    <div className="glass rounded-2xl border-warm p-5 animate-fade-up">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="size-4 text-primary" /> Pipeline Distribution
      </h3>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">No leads in pipeline yet.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex h-3 rounded-full overflow-hidden bg-secondary/50">
            {stages.map((stage) => {
              const count = breakdown[stage.key] || 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return pct > 0 ? (
                <div
                  key={stage.key}
                  className={`${stage.color} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${stage.label}: ${count}`}
                />
              ) : null;
            })}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {stages.map((stage) => {
              const count = breakdown[stage.key] || 0;
              return (
                <div key={stage.key} className="text-center">
                  <div className={`size-2 rounded-full ${stage.color} mx-auto mb-1`} />
                  <div className="text-[10px] text-muted-foreground">{stage.label}</div>
                  <div className="text-sm font-semibold">{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardContent({ role }: { role: string | null }) {
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAnalytics({});
      if (result.status === "ok" && result.data) {
        setAnalytics(result.data);
      } else if (result.status === "db_unavailable") {
        setError("Database unavailable — analytics cannot be computed");
      } else {
        setError("Failed to compute analytics");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center space-y-3">
          <Loader2 className="size-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Computing analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl border-warm p-8 text-center">
        <AlertTriangle className="size-10 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-amber-700">Analytics Unavailable</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
        >
          <RefreshCw className="size-3" /> Retry
        </button>
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Total Leads"
          value={analytics.totalLeads}
          sublabel={`${analytics.leadsThisWeek} this week · ${analytics.leadsThisMonth} this month`}
          color="text-primary"
          accent="bg-primary/10"
        />
        <StatCard
          icon={TrendingUp}
          label="Conversion Velocity"
          value={`${analytics.conversionVelocity}/day`}
          sublabel="Avg leads per day (30 days)"
          color="text-emerald-500"
          accent="bg-emerald-500/10"
        />
        <StatCard
          icon={Activity}
          label="Triage → Schedule"
          value={`${analytics.triageToScheduleRate}%`}
          sublabel={`${analytics.noShowPercentage}% no-show rate`}
          color="text-amber-500"
          accent="bg-amber-500/10"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue at Risk"
          value={`KES ${analytics.revenueAtRisk.toLocaleString()}`}
          sublabel="High-priority leads not yet converted"
          color="text-red-500"
          accent="bg-red-500/10"
        />
      </div>

      {/* Financial KPIs — owners/admin only */}
      {canAccessFinance(role) && (<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Receipt}
          label="Accounts Receivable"
          value={`KES ${analytics.accountsReceivable.toLocaleString()}`}
          sublabel="Unpaid invoices"
          color="text-amber-500"
          accent="bg-amber-500/10"
        />
        <StatCard
          icon={Landmark}
          label="MRR (This Month)"
          value={`KES ${analytics.monthlyRecurringRevenue.toLocaleString()}`}
          sublabel="Paid invoices this month"
          color="text-emerald-500"
          accent="bg-emerald-500/10"
        />
        <StatCard
          icon={Percent}
          label="Collection Rate"
          value={`${analytics.collectionRate}%`}
          sublabel="Paid / Total invoices"
          color="text-violet-500"
          accent="bg-violet-500/10"
        />
        <StatCard
          icon={UserCheck}
          label="Top Resource"
          value={
            analytics.revenuePerResource.length > 0
              ? analytics.revenuePerResource[0].name
              : "N/A"
          }
          sublabel={
            analytics.revenuePerResource.length > 0
              ? `KES ${analytics.revenuePerResource[0].revenue.toLocaleString()}`
              : "No resource data"
          }
          color="text-sky-500"
          accent="bg-sky-500/10"
        />
      </div>)}

      {canAccessFinance(role) && analytics.revenuePerResource.length > 0 && (
        <div className="glass rounded-2xl border-warm p-5 animate-fade-up">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" /> Revenue Per Resource
          </h3>
          <div className="space-y-2">
            {analytics.revenuePerResource.map((r) => (
              <div key={r.resourceId} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">({r.type})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground">{r.appointmentCount} appts</span>
                  <span className="text-xs font-semibold">KES {r.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <StageBreakdownBar breakdown={analytics.stageBreakdown} />

      <div className="glass rounded-2xl border-warm p-5 animate-fade-up">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Clock className="size-4 text-primary" /> Lead Activity
        </h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              This Week
            </div>
            <div className="text-xl font-bold">{analytics.leadsThisWeek}</div>
          </div>
          <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              This Month
            </div>
            <div className="text-xl font-bold">{analytics.leadsThisMonth}</div>
          </div>
          <div className="bg-secondary/30 rounded-xl p-4 border border-border/50">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Priority Breakdown
            </div>
            <div className="space-y-1 mt-2">
              {Object.entries(analytics.priorityBreakdown).map(([p, c]) => (
                <div key={p} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{p}</span>
                  <span className="font-semibold">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground/60 text-right">
        Generated {new Date(analytics.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { loading, authenticated, role } = useAuth();

  useEffect(() => {
    if (!loading && !authenticated) {
      navigate({ to: "/admin/login" });
    }
  }, [loading, authenticated, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="size-10 rounded-xl gradient-hero flex items-center justify-center mx-auto">
            <Shield className="size-5 text-primary-foreground animate-pulse" />
          </div>
          <p className="text-sm text-muted-foreground">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg gradient-hero flex items-center justify-center">
              <Shield className="size-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm">Operations Dashboard</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Executive Command Centre
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NetworkStatus />
            <Link
              to="/admin/triage"
              className="size-8 rounded-lg glass flex items-center justify-center hover:bg-secondary transition-colors"
              title="Triage Console"
            >
              <ArrowLeft className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <div className="h-40 animate-pulse rounded-2xl bg-secondary/30" />
          }
        >
          <ErrorBoundary>
            <DashboardContent role={role} />
          </ErrorBoundary>
        </Suspense>
      </div>
    </div>
  );
}
