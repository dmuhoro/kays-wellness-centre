import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Download, Upload, FileSpreadsheet, FileUp, Loader2, AlertCircle,
  Shield, Lock, CheckCircle2, XCircle, UploadCloud,
} from "lucide-react";
import { generateExport } from "@/lib/exports.server";
import { bulkImportLeads } from "@/lib/import.server";
import { useAuth } from "@/hooks/useAuth";
import type { ImportResult } from "@/lib/import.server";

export const Route = createFileRoute("/admin/settings/data")({
  head: () => ({
    meta: [
      { title: "Data Management — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DataManagementPage,
});

const DATASETS = [
  { value: "leads" as const, label: "Lead Records", desc: "All patient leads with status, priority, and timestamps" },
  { value: "invoices" as const, label: "Invoice Ledger", desc: "Invoice amounts, payment status, and dates" },
  { value: "interactions" as const, label: "Interaction Log", desc: "Event history for each lead across the pipeline" },
  { value: "audit_logs" as const, label: "Audit Trail", desc: "Compliance log of admin actions and data access" },
];

function RestrictedAccess() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-sm space-y-4">
        <div className="size-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto">
          <Lock className="size-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground">
          Data management is only available to clinic owners and administrators.
        </p>
        <Link
          to="/admin/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
        >
          <ArrowLeft className="size-4" /> Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

function DataManagementPage() {
  const navigate = useNavigate();
  const { loading: authLoading, authenticated, role } = useAuth();
  const [dataset, setDataset] = useState<"leads" | "invoices" | "interactions" | "audit_logs">("leads");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && !authenticated) {
      navigate({ to: "/admin/login" });
    }
  }, [authLoading, authenticated, navigate]);

  if (authLoading) return null;
  if (!authenticated) return null;
  if (role !== "super_admin" && role !== "admin") return <RestrictedAccess />;

  const handleExport = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await generateExport({
        data: { dataset, startDate: startDate || undefined, endDate: endDate || undefined },
      });
      if (result.status === "db_unavailable") {
        setError("Database unavailable — export cannot be generated");
        return;
      }
      if (result.status === "ok") {
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      setError("Export failed — please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setError("CSV must contain a header row and at least one data row");
        return;
      }

      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map((line) => {
        const vals = parseCsvLine(line);
        const row: Record<string, unknown> = {};
        headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
        return row;
      });

      const result = await bulkImportLeads({ data: { rows } });
      setImportResult(result);
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <Link
            to="/admin/triage"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </div>

        <div className="mb-8">
          <div className="size-12 rounded-2xl gradient-hero flex items-center justify-center mb-4">
            <FileSpreadsheet className="size-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Data Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export datasets or bulk-import historical lead records via CSV.
          </p>
        </div>

        {/* --- Export Section --- */}
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Download className="size-4 text-primary" /> Export Data
        </h2>

        <div className="glass rounded-2xl border-warm p-6 space-y-6 mb-8">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-600">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-3 block">Dataset</label>
            <div className="space-y-2">
              {DATASETS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDataset(d.value)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    dataset === d.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{d.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{d.desc}</div>
                    </div>
                    {dataset === d.value && (
                      <div className="size-2 rounded-full bg-primary" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold mb-1.5 block">Start Date (optional)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block">End Date (optional)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl gradient-hero px-6 py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 hover:shadow-glow transition-all"
          >
            {loading ? (
              <><Loader2 className="size-4 animate-spin" /> Generating export...</>
            ) : (
              <><Download className="size-4" /> Download CSV</>
            )}
          </button>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border">
            <Shield className="size-3" />
            All exports are logged to the immutable audit trail.
          </div>
        </div>

        {/* --- Import Section --- */}
        <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Upload className="size-4 text-primary" /> Bulk Import Leads
        </h2>

        <div className="glass rounded-2xl border-warm p-6 space-y-6">
          <p className="text-xs text-muted-foreground">
            Upload a CSV file with lead records. Required column: <code className="bg-secondary px-1 rounded text-[10px]">name</code>.
            Optional columns: <code className="bg-secondary px-1 rounded text-[10px]">phone</code>, <code className="bg-secondary px-1 rounded text-[10px]">email</code>, <code className="bg-secondary px-1 rounded text-[10px]">service</code>, <code className="bg-secondary px-1 rounded text-[10px]">channel</code>, <code className="bg-secondary px-1 rounded text-[10px]">priority</code>.
            Column headers are case-insensitive.
          </p>

          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-secondary/20 transition-all"
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
              disabled={importing}
            />
            {importing ? (
              <><Loader2 className="size-8 animate-spin text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Importing...</p></>
            ) : (
              <><UploadCloud className="size-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium">Click to select CSV file</p><p className="text-xs text-muted-foreground mt-1">or drag and drop</p></>
            )}
          </div>

          {importResult && (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {importResult.errors.length === 0 ? (
                  <><CheckCircle2 className="size-4 text-emerald-500" /> Import complete</>
                ) : (
                  <><AlertCircle className="size-4 text-amber-500" /> Import completed with errors</>
                )}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Total rows: <strong>{importResult.total}</strong></span>
                <span>Inserted: <strong className="text-emerald-500">{importResult.inserted}</strong></span>
                <span>Errors: <strong className="text-red-500">{importResult.errors.length}</strong></span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {importResult.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] text-red-600 bg-red-500/5 rounded-lg p-2">
                      <XCircle className="size-3 mt-0.5 shrink-0" />
                      <span>Row {err.row}: {err.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
