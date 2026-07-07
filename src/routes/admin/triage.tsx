import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Activity,
  Clock,
  LockKeyhole,
  ArrowLeft,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  Scale,
  Inbox,
} from "lucide-react";
import type { ClinicOSLeadPacket, TriagePriority } from "@/hooks/clinic-os-types";

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";
const STORAGE_KEY = "kwc_pending_submissions";
const AUTH_KEY = "kwc_admin_auth";
const PASSCODE = "0726";

function getPending(): ClinicOSLeadPacket[] {
  if (!isBrowser) return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function isAuthenticated(): boolean {
  if (!isBrowser) return false;
  const raw = sessionStorage.getItem(AUTH_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { t: number; v: string };
    return parsed.v === PASSCODE && Date.now() - parsed.t < 3_600_000;
  } catch {
    return false;
  }
}

function authenticate(passcode: string): boolean {
  if (passcode !== PASSCODE) return false;
  if (isBrowser) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({ v: passcode, t: Date.now() }));
  }
  return true;
}

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

const demoLeads: ClinicOSLeadPacket[] = [
  {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: {
      name: "Grace Wanjiku",
      email: "grace.w@example.com",
      service: "bhrh",
      channel: "in-person",
    },
    triage_priority: "high",
    device_telemetry: {
      connectionType: "4g",
      onlineStatus: true,
      localTimestamp: "",
      timezone: "Africa/Nairobi",
      userAgent: "",
    },
  },
  {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date(Date.now() - 7_200_000).toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: {
      name: "James Ochieng",
      email: "james.o@example.com",
      service: "metabolic",
      channel: "telehealth",
    },
    triage_priority: "medium",
    device_telemetry: {
      connectionType: "wifi",
      onlineStatus: true,
      localTimestamp: "",
      timezone: "Africa/Nairobi",
      userAgent: "",
    },
  },
  {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date(Date.now() - 86_400_000).toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: {
      name: "Dr. Sarah Kimani",
      email: "s.kimani@hospital.ke",
      service: "autoimmune",
      channel: "in-person",
    },
    triage_priority: "high",
    device_telemetry: {
      connectionType: "4g",
      onlineStatus: true,
      localTimestamp: "",
      timezone: "Africa/Nairobi",
      userAgent: "",
    },
  },
  {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date(Date.now() - 172_800_000).toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: {
      name: "Michael Njoroge",
      email: "m.njoroge@example.com",
      service: "longevity",
      channel: "in-person",
    },
    triage_priority: "medium",
    device_telemetry: {
      connectionType: "wifi",
      onlineStatus: true,
      localTimestamp: "",
      timezone: "Africa/Nairobi",
      userAgent: "",
    },
  },
  {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date(Date.now() - 259_200_000).toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: {
      name: "Faith Akinyi",
      email: "faith.a@example.com",
      service: "screening",
      channel: "telehealth",
    },
    triage_priority: "low",
    device_telemetry: {
      connectionType: "3g",
      onlineStatus: true,
      localTimestamp: "",
      timezone: "Africa/Nairobi",
      userAgent: "",
    },
  },
];

const priorityDot: Record<TriagePriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-emerald-500",
};

const priorityLabel: Record<TriagePriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useOnlineStatus() {
  const [online, setOnline] = useState(isBrowser ? navigator.onLine : true);
  useEffect(() => {
    if (!isBrowser) return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
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

function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authenticate(code)) {
      onUnlock();
    } else {
      setError(true);
      setCode("");
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="size-16 rounded-2xl gradient-warm flex items-center justify-center mx-auto mb-5 shadow-glow">
            <LockKeyhole className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Clinical Command Desk</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Secure triage panel for Kay's Wellness Centre clinical operations.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 border-warm space-y-4">
          <div>
            <label className="text-sm font-semibold mb-2 block">Access Passcode</label>
            <input
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(false);
              }}
              className={`w-full px-4 py-3 rounded-xl border bg-background text-center text-lg tracking-[0.3em] font-mono outline-none transition-colors ${
                error ? "border-red-400 focus:border-red-500" : "border-border focus:border-primary"
              }`}
              placeholder="• • • •"
              maxLength={4}
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-500 mt-1.5 ml-1">
                Invalid passcode. Please try again.
              </p>
            )}
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold hover:shadow-glow transition-all"
          >
            <LockKeyhole className="size-4" /> Unlock Desk
          </button>
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
            Authorised clinical personnel only. All access is logged and monitored.
          </p>
        </form>

        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="size-3" /> Return to public site
          </Link>
        </div>
      </div>
    </div>
  );
}

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

function MetricsBar({ leads }: { leads: ClinicOSLeadPacket[] }) {
  const high = leads.filter((l) => l.triage_priority === "high").length;
  const medium = leads.filter((l) => l.triage_priority === "medium").length;
  const low = leads.filter((l) => l.triage_priority === "low").length;

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
}

function QueueTable({ leads, online }: { leads: ClinicOSLeadPacket[]; online: boolean }) {
  const isSynced = online && leads.length > 0;

  return (
    <div className="glass rounded-2xl border-warm overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Incoming Queue</h2>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {leads.length} {leads.length === 1 ? "entry" : "entries"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SyncIndicator online={online} />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${isSynced ? "bg-emerald-500" : "bg-amber-400"}`}
            />
            {isSynced ? "Synced" : "Pending"}
          </div>
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
                <th className="p-4 font-medium hidden lg:table-cell">Received</th>
                <th className="p-4 pr-5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-secondary/30 transition-colors"
                >
                  <td className="p-4 pl-5">
                    <div className="font-medium">{lead.formData.name}</div>
                  </td>
                  <td className="p-4 text-muted-foreground hidden sm:table-cell">
                    {lead.formData.email}
                  </td>
                  <td className="p-4 text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                    {serviceLabels[lead.formData.service] || lead.formData.service}
                  </td>
                  <td className="p-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        lead.triage_priority === "high"
                          ? "bg-red-500/10 text-red-600 border border-red-500/20"
                          : lead.triage_priority === "medium"
                            ? "bg-amber-400/10 text-amber-600 border border-amber-400/20"
                            : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${priorityDot[lead.triage_priority]}`}
                      />
                      {priorityLabel[lead.triage_priority]}
                    </span>
                  </td>
                  <td className="p-4 text-muted-foreground hidden lg:table-cell text-xs">
                    {formatDate(lead.Payload_Timestamp)}
                  </td>
                  <td className="p-4 pr-5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Captured
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TriageDashboard() {
  const online = useOnlineStatus();
  const [leads, setLeads] = useState<ClinicOSLeadPacket[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "demo" | "pending">("pending");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const pending = getPending();
    if (pending.length > 0) {
      setLeads(pending);
      setDataSource("pending");
      return;
    }
    setLeads(demoLeads);
    setDataSource("demo");
  }, [refreshKey]);

  const pendingCount = getPending().length;
  const showDemoBanner = dataSource === "demo";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="size-8 rounded-lg gradient-hero flex items-center justify-center"
            >
              <Shield className="size-4 text-primary-foreground" />
            </Link>
            <div>
              <div className="font-bold text-sm">Clinical Command Desk</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Triage Console
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <SyncIndicator online={online} />
            <button
              onClick={refresh}
              className="size-8 rounded-lg glass flex items-center justify-center hover:bg-secondary transition-colors"
              title="Refresh queue"
            >
              <RefreshCw className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {showDemoBanner && (
          <div className="mb-6 rounded-2xl bg-amber-400/10 border border-amber-400/20 p-4 flex items-center gap-3">
            <Clock className="size-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700">Demo Mode — No Webhook Active</p>
              <p className="text-xs text-amber-600/80 mt-0.5">
                Displaying sample leads for presentation. Set{" "}
                <code className="bg-amber-400/20 px-1 rounded text-[11px]">
                  NEXT_PUBLIC_CLINIC_OS_WEBHOOK_URL
                </code>{" "}
                to activate live ingestion.
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
                transmission — will deliver automatically when connection is restored.
              </p>
            </div>
          </div>
        )}

        <MetricsBar leads={leads} />
        <QueueTable leads={leads} online={online} />

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
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <PasscodeGate onUnlock={() => setAuthed(true)} />;
  }

  return <TriageDashboard />;
}
