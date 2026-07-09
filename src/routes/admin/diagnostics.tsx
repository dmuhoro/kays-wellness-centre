import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Shield,
  ArrowLeft,
  Activity,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  LogOut,
} from "lucide-react";
import { getPending, STORAGE_KEY } from "@/hooks/useClinicOSSubmit";
import { submitLead, fetchLeads } from "@/lib/api/leads.server";
import { getServerStatus } from "@/lib/api/diagnostics.server";

const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

export const Route = createFileRoute("/admin/diagnostics")({
  head: () => ({
    meta: [
      { title: "System Diagnostics — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DiagnosticsDashboard,
});

function DiagnosticsDashboard() {
  const [dbStatus, setDbStatus] = useState<"checking" | "available" | "unavailable">("checking");
  const [dbError, setDbError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<string | null>(null);

  useEffect(() => {
    getServerStatus({}).then((status) => {
      setDbStatus(status.dbAvailable ? "available" : "unavailable");
      setDbError(status.dbError);
    });
  }, []);

  const runSubmitTest = async () => {
    setTestResult("running...");
    try {
      const result = await submitLead({
        data: {
          name: "[Diagnostics] Test Lead",
          email: "diagnostics@kayswellness.test",
          service: "diagnostic",
          channel: "diagnostic",
          priority: "low",
        },
      });
      setTestResult(`submitLead → ${JSON.stringify(result)}`);
    } catch (err) {
      setTestResult(`submitLead threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const runFetchTest = async () => {
    setQueryResult("running...");
    try {
      const result = await fetchLeads({});
      setQueryResult(
        `fetchLeads → source: ${result.source}, rows: ${result.rows.length}${
          "reason" in result ? `, reason: ${result.reason}` : ""
        }`,
      );
    } catch (err) {
      setQueryResult(`fetchLeads threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearQueue = () => {
    if (isBrowser) {
      localStorage.removeItem(STORAGE_KEY);
      setTestResult("localStorage queue cleared");
    }
  };

  const pendingCount = getPending().length;

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
                Engineering Console
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
                <WifiOff className="size-3" /> DB Offline
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Panel: Runtime Status */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Runtime Status
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <CheckLabel ok={isBrowser} label="Browser environment detected" />
            <CheckLabel
              ok={typeof navigator !== "undefined" && navigator.onLine}
              label="Network connectivity"
            />
            <CheckLabel ok={dbStatus === "available"} label="Database reachable" />
            <CheckLabel ok={pendingCount === 0} label="Offline queue empty" />
          </div>
          {dbError && (
            <p className="mt-3 text-xs text-red-600 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
              DB error: {dbError}
            </p>
          )}
        </div>

        {/* Panel: Cold-Start Degradation Simulation */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <WifiOff className="size-4 text-amber-500" /> Degradation Simulation
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            When <code className="bg-secondary px-1 rounded">isDbAvailable()</code> returns{" "}
            <code className="bg-secondary px-1 rounded">false</code>, the system degrades as
            follows:
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <CheckCircle className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <strong>Triage panel:</strong> Shows "No Database Connection" amber banner. Leads
                table displays empty state. Metrics bar shows all zeros. Top-level ErrorBoundary is
                NOT triggered.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <strong>Form submission:</strong> <code>submitLead</code> returns{" "}
                <code>{'{ status: "db_unavailable" }'}</code>. The form hook queues the submission
                to localStorage for deferred delivery.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <strong>Fetch:</strong> <code>fetchLeads</code> returns{" "}
                <code>{'{ rows: [], source: "offline" }'}</code>. The triage page reads
                <code> data.source === "offline"</code> and displays the degradation banner.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
              <span>
                <strong>Mutations:</strong> <code>updateLead</code> / <code>deleteLead</code> return{" "}
                <code>{'{ status: "db_unavailable" }'}</code>. Optimistic updates roll back. No
                error boundary triggered.
              </span>
            </li>
          </ul>
        </div>

        {/* Panel: Write-Path Test */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Write-Path Verification
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={runSubmitTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
            >
              <Database className="size-3" /> Test submitLead
            </button>
            <button
              onClick={runFetchTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500/10 text-sky-600 text-xs font-semibold hover:bg-sky-500/20 transition-colors"
            >
              <RefreshCw className="size-3" /> Test fetchLeads
            </button>
            <button
              onClick={clearQueue}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 text-red-600 text-xs font-semibold hover:bg-red-500/20 transition-colors"
            >
              <Trash2 className="size-3" /> Clear offline queue
            </button>
          </div>
          {testResult && (
            <pre className="mt-3 text-xs bg-secondary/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono">
              {testResult}
            </pre>
          )}
          {queryResult && (
            <pre className="mt-3 text-xs bg-secondary/40 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono">
              {queryResult}
            </pre>
          )}
        </div>

        {/* Panel: Offline Queue */}
        <div className="glass rounded-2xl border-warm p-5">
          <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <WifiOff className="size-4 text-amber-500" /> Offline Queue State
          </h2>
          <p className="text-xs text-muted-foreground mb-2">
            {pendingCount} pending {pendingCount === 1 ? "submission" : "submissions"} in
            localStorage.
          </p>
          <pre className="text-xs bg-secondary/40 rounded-xl p-3 overflow-x-auto max-h-40 font-mono">
            {isBrowser
              ? JSON.stringify(getPending(), null, 2) || "(empty)"
              : "(not in browser)"}
          </pre>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-6">
          <Link to="/admin/triage" className="hover:text-primary inline-flex items-center gap-1.5">
            <ArrowLeft className="size-3" /> Return to Command Desk
          </Link>
          <p>Kay's Wellness Centre — Engineering Diagnostics</p>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPage() {
  const [authed, setAuthed] = useState(isAuthenticated());

  if (!authed) {
    return <PasscodeGate onUnlock={() => setAuthed(true)} />;
  }

  return <DiagnosticsDashboard />;
}
