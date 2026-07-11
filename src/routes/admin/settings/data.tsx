import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, AlertCircle, Shield } from "lucide-react";
import { generateExport } from "@/lib/exports.server";

export const Route = createFileRoute("/admin/settings/data")({
  head: () => ({
    meta: [
      { title: "Data Export — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DataExportPage,
});

const DATASETS = [
  { value: "leads" as const, label: "Lead Records", desc: "All patient leads with status, priority, and timestamps" },
  { value: "invoices" as const, label: "Invoice Ledger", desc: "Invoice amounts, payment status, and dates" },
  { value: "interactions" as const, label: "Interaction Log", desc: "Event history for each lead across the pipeline" },
  { value: "audit_logs" as const, label: "Audit Trail", desc: "Compliance log of admin actions and data access" },
];

function DataExportPage() {
  const [dataset, setDataset] = useState<"leads" | "invoices" | "interactions" | "audit_logs">("leads");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          <h1 className="text-2xl font-bold">Data Export</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Download structured CSV datasets for tax, audit, and regulatory compliance.
          </p>
        </div>

        <div className="glass rounded-2xl border-warm p-6 space-y-6">
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
              <>
                <Loader2 className="size-4 animate-spin" /> Generating export...
              </>
            ) : (
              <>
                <Download className="size-4" /> Download CSV
              </>
            )}
          </button>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-2 border-t border-border">
            <Shield className="size-3" />
            All exports are logged to the immutable audit trail.
          </div>
        </div>
      </div>
    </div>
  );
}
