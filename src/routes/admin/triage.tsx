import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, Suspense, memo } from "react";
import {
  Shield,
  Users,
  Activity,
  Clock,
  ArrowLeft,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  Scale,
  Inbox,
  AlertCircle,
  Trash2,
  ChevronDown,
  Check,
  LogOut,
} from "lucide-react";
import { format } from "date-fns";
import type { TriagePriority } from "@/hooks/clinic-os-types";
import { getPending } from "@/hooks/useClinicOSSubmit";
import type { LeadRow } from "@/lib/api/leads.server";
import { useLeads, useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { ErrorBoundary } from "@/components/ui/error-boundary";

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

const serviceLabels: Record<string, string> = {
  bhrh: "Bioidentical Hormone Restoration",
  "iv-nutrition": "IV Nutritional Therapy",
  metabolic: "Metabolic Optimization",
  "chronic-disease": "Chronic Disease Management",
  longevity: "Longevity Medicine",
  autoimmune: "Autoimmune Root-Cause Care",
  screening: "Advanced Biometric Screening",
  "weight-management": "Functional Weight Management",
  digestive: "Digestive Health Assessment",
  lifestyle: "Lifestyle Medicine Program",
  "lab-testing": "Functional Lab Testing",
  physio: "Physiotherapy & Osteopathy",
};

const statusOptions = ["pending", "contacted", "scheduled", "converted", "closed"];

const priorityOptions: TriagePriority[] = ["high", "medium", "low"];

const priorityLabel: Record<TriagePriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatDate(iso: string): string {
  return format(new Date(iso), "d MMM, HH:mm");
}

export const Route = createFileRoute("/admin/triage")({
  head: () => ({
    meta: [
      { title: "Clinical Command Desk — Kay's Wellness Centre" },
      {
        name: "description",
        content: "Secure triage command panel for Kay's Wellness Centre lead intake.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TriagePage,
});

function SyncIndicator({ online }: { online: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="relative flex size-2.5">
        {online ? (
          <span className="absolute inset-0 rounded-full bg-emerald-500" />
        ) : (
          <>
            <span className="absolute inset-0 rounded-full bg-amber-400 animate-ping" />
            <span className="absolute inset-0 rounded-full bg-amber-400" />
          </>
        )}
      </span>
      <span className="text-muted-foreground">
        {online ? (
          <>
            <Wifi className="size-3 inline mr-1" /> System Online
          </>
        ) : (
          <>
            <WifiOff className="size-3 inline mr-1" /> Offline Queue
          </>
        )}
      </span>
    </div>
  );
}

const MetricsBar = memo(function MetricsBar({ leads }: { leads: LeadRow[] }) {
  const high = leads.filter((l) => l.priority === "high").length;
  const medium = leads.filter((l) => l.priority === "medium").length;
  const low = leads.filter((l) => l.priority === "low").length;

  const metrics = [
    { label: "Total Leads", value: leads.length, icon: Users, color: "text-primary" },
    { label: "High Priority", value: high, icon: Activity, color: "text-red-500" },
    { label: "Medium Priority", value: medium, icon: Activity, color: "text-amber-500" },
    { label: "Low Priority", value: low, icon: Activity, color: "text-emerald-500" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
      {metrics.map((m) => (
        <div key={m.label} className="glass rounded-2xl p-4 border-warm animate-fade-up">
          <div className="flex items-center gap-2 mb-2">
            <m.icon className={`size-4 ${m.color}`} />
            <span className="text-xs text-muted-foreground font-medium">{m.label}</span>
          </div>
          <div className={`text-3xl font-bold ${m.color}`}>{m.value}</div>
        </div>
      ))}
    </div>
  );
});

const InlineSelect = memo(function InlineSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<string, string>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border border-border hover:bg-secondary/50 transition-colors"
      >
        {labels[value] || value}
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[120px] rounded-xl border border-border bg-popover shadow-md overflow-hidden">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-secondary/50 transition-colors ${
                  opt === value ? "font-semibold" : ""
                }`}
              >
                {opt === value && <Check className="size-3" />}
                <span className={opt === value ? "" : "ml-5"}>{labels[opt] || opt}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

const QueueTable = memo(function QueueTable({ leads }: { leads: LeadRow[] }) {
  const updateMutation = useUpdateLead();
  const deleteMutation = useDeleteLead();

  return (
    <div className="glass rounded-2xl border-warm overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Incoming Queue</h2>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {leads.length} {leads.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="p-10 text-center">
          <Inbox className="size-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No incoming leads yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Patient submissions will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="p-4 pl-5 font-medium">Client</th>
                <th className="p-4 font-medium hidden sm:table-cell">Contact</th>
                <th className="p-4 font-medium hidden md:table-cell">Service</th>
                <th className="p-4 font-medium">Priority</th>
                <th className="p-4 font-medium hidden lg:table-cell">Appointment</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 pr-5 font-medium w-12" />
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                >
                  <td className="p-4 pl-5">
                    <div className="font-medium">{lead.name}</div>
                  </td>
                  <td className="p-4 text-muted-foreground hidden sm:table-cell">
                    {lead.email}
                    {lead.phone && (
                      <span className="block text-[11px] opacity-70">{lead.phone}</span>
                    )}
                  </td>
                  <td className="p-4 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                    {serviceLabels[lead.service] || lead.service}
                  </td>
                  <td className="p-4">
                    <InlineSelect
                      value={lead.priority as TriagePriority}
                      options={priorityOptions}
                      labels={priorityLabel}
                      onChange={(v) => updateMutation.mutate({ id: lead.id, priority: v })}
                    />
                  </td>
                  <td className="p-4 text-muted-foreground hidden lg:table-cell text-xs">
                    {lead.appointment_timestamp
                      ? formatDate(lead.appointment_timestamp)
                      : "—"}
                  </td>
                  <td className="p-4">
                    <InlineSelect
                      value={lead.status}
                      options={statusOptions}
                      labels={Object.fromEntries(
                        statusOptions.map((s) => [
                          s,
                          s.charAt(0).toUpperCase() + s.slice(1),
                        ]),
                      )}
                      onChange={(v) => updateMutation.mutate({ id: lead.id, status: v })}
                    />
                  </td>
                  <td className="p-4 pr-5">
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete lead for ${lead.name}?`)) {
                          deleteMutation.mutate(lead.id);
                        }
                      }}
                      className="size-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="Delete lead"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

function TriageDashboard() {
  const { data, isFetching, error } = useLeads();
  const [online, setOnline] = useState(true);
  const pendingCount = getPending().length;

  useEffect(() => {
    if (!isBrowser) return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const leads = data?.source === "db" ? data.rows : [];
  const isOffline = data?.source === "offline";
  const showOfflineBanner = isOffline && !error;
  const showLiveBanner = data?.source === "db" && !error && !isOffline;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg gradient-hero flex items-center justify-center">
              <Shield className="size-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold text-sm">Clinical Command Desk</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Triage Console
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SyncIndicator online={online} />
            {isFetching && <RefreshCw className="size-4 text-muted-foreground animate-spin" />}
            <Link
              to="/admin/login"
              className="size-8 rounded-lg glass flex items-center justify-center hover:bg-secondary transition-colors"
              title="Sign out"
            >
              <LogOut className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
            <AlertCircle className="size-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">Query Failed</p>
              <p className="text-xs text-red-600/80 mt-0.5">
                Could not reach the database. Check DATABASE_URL configuration.
              </p>
            </div>
          </div>
        )}

        {showOfflineBanner && !error && (
          <div className="mb-6 rounded-2xl bg-amber-400/10 border border-amber-400/20 p-4 flex items-center gap-3">
            <Clock className="size-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700">No Database Connection</p>
              <p className="text-xs text-amber-600/80 mt-0.5">
                Set <code className="bg-amber-400/20 px-1 rounded text-[11px]">DATABASE_URL</code>{" "}
                to activate live data. Pending submissions will queue locally and auto-sync when DB
                is available.
              </p>
            </div>
          </div>
        )}

        {showLiveBanner && leads.length > 0 && (
          <div className="mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
            <Activity className="size-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700">Live Database Active</p>
              <p className="text-xs text-emerald-600/80 mt-0.5">
                Displaying {leads.length} lead{leads.length !== 1 ? "s" : ""} from PostgreSQL.
              </p>
            </div>
          </div>
        )}

        {pendingCount > 0 && (
          <div className="mb-6 rounded-2xl bg-sky-500/10 border border-sky-500/20 p-4 flex items-center gap-3">
            <RefreshCw className="size-5 text-sky-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-700">Offline Queue Active</p>
              <p className="text-xs text-sky-600/80 mt-0.5">
                {pendingCount} {pendingCount === 1 ? "submission" : "submissions"} pending
                transmission.
              </p>
            </div>
          </div>
        )}

        <ErrorBoundary>
          <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl bg-secondary/30" />}>
            <MetricsBar leads={leads} />
            <QueueTable leads={leads} />
          </Suspense>
        </ErrorBoundary>

        <div className="mt-8 flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-6">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <FileText className="size-3" />
              <Link to="/privacy-policy" className="hover:text-primary transition-colors">
                Privacy Policy
              </Link>
            </span>
            <span className="flex items-center gap-1.5">
              <Scale className="size-3" />
              <Link to="/terms" className="hover:text-primary transition-colors">
                Terms of Service
              </Link>
            </span>
          </div>
          <p>Kay's Wellness Centre — Confidential Clinical Operations</p>
        </div>
      </div>
    </div>
  );
}

function TriagePage() {
  return (
    <ErrorBoundary>
      <TriageDashboard />
    </ErrorBoundary>
  );
}
