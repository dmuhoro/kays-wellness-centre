import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DollarSign, Receipt, Wallet, CreditCard, Smartphone, Loader2, ChevronDown, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { fetchInvoices, fetchPayments, addPayment } from "@/lib/api/billing.server";
import type { InvoiceRow, PaymentRow } from "@/lib/api/billing.server";
import { paymentSchema, type PaymentInput } from "@/lib/schemas/client-validators";

const STATUS_COLORS: Record<string, string> = {
  draft: "text-gray-500 bg-gray-500/10",
  issued: "text-amber-500 bg-amber-500/10",
  paid: "text-emerald-500 bg-emerald-500/10",
  void: "text-red-500 bg-red-500/10",
};

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  cash: Wallet,
  mobile_money: Smartphone,
  card: CreditCard,
};

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  mobile_money: "Mobile Money",
  card: "Card",
};

function PaymentForm({
  invoice,
  onClose,
}: {
  invoice: InvoiceRow;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { amount: invoice.total_amount, method: "cash", notes: "" },
    mode: "onSubmit",
  });

  const payMutation = useMutation({
    mutationFn: (data: { invoiceId: number; amount: number; method: "cash" | "mobile_money" | "card"; notes?: string }) =>
      addPayment({ data }),
    onSuccess: (result) => {
      if (result.status === "ok") {
        toast.success("Payment recorded", {
          description: result.invoiceFullyPaid ? "Invoice fully paid" : "Partial payment logged",
        });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["payments"] });
        onClose();
      }
    },
    onError: (err) => {
      toast.error("Payment failed", {
        description: err instanceof Error ? err.message : "Could not record payment",
      });
    },
  });

  const handleSubmit = (data: PaymentInput) => {
    payMutation.mutate({ invoiceId: invoice.id, ...data, notes: data.notes || undefined });
  };

  const amount = form.watch("amount");
  const method = form.watch("method");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md mx-4 p-6 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-sm mb-1">Record Payment</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Invoice {invoice.invoice_number} — KES {invoice.total_amount.toLocaleString()}
        </p>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium mb-1 text-muted-foreground">Amount (KES)</label>
            <input
              type="number"
              min={1}
              {...form.register("amount", { valueAsNumber: true })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {form.formState.errors.amount && (
              <p className="text-[10px] text-red-500 mt-1">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1 text-muted-foreground">Payment Method</label>
            <div className="grid grid-cols-3 gap-2">
              {(["cash", "mobile_money", "card"] as const).map((m) => {
                const Icon = METHOD_ICONS[m];
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => form.setValue("method", m)}
                    className={`flex flex-col items-center gap-1 rounded-lg border py-2 px-3 text-xs transition-colors ${
                      method === m
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-secondary/30 text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    {METHOD_LABELS[m]}
                  </button>
                );
              })}
            </div>
            {form.formState.errors.method && (
              <p className="text-[10px] text-red-500 mt-1">{form.formState.errors.method.message}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium mb-1 text-muted-foreground">Notes (optional)</label>
            <input
              type="text"
              {...form.register("notes")}
              placeholder="e.g., M-Pesa confirmation ABC123"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={payMutation.isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {payMutation.isPending ? (
                <Loader2 className="size-4 animate-spin mx-auto" />
              ) : (
                `Record KES ${amount.toLocaleString()}`
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PaymentHistory({
  invoiceId,
  onClose,
}: {
  invoiceId: number;
  onClose: () => void;
}) {
  const { data: result } = useQuery({
    queryKey: ["payments", invoiceId],
    queryFn: () => fetchPayments({ data: { invoiceId } }),
  });
  const payments = result?.status === "ok" ? result.payments : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[70vh] flex flex-col mx-4 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-sm">Payment History</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {payments.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No payments recorded yet.</p>
          )}
          {payments.map((p) => {
            const Icon = METHOD_ICONS[p.method] || Wallet;
            return (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                  <Icon className="size-4 text-muted-foreground" />
                  <div>
                    <div className="text-xs font-medium">{METHOD_LABELS[p.method] || p.method}</div>
                    <div className="text-[10px] text-muted-foreground">{p.receipt_number}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold">KES {p.amount.toLocaleString()}</div>
                  <div className="text-[9px] text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BillingLedger() {
  const queryClient = useQueryClient();
  const { data: result, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => fetchInvoices({}),
    refetchInterval: 30_000,
  });
  const invoices = result?.status === "ok" ? result.invoices : [];

  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [historyInvoiceId, setHistoryInvoiceId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Receipt className="size-4 text-primary" /> Billing Ledger
        </h3>
        <span className="text-[10px] text-muted-foreground">{invoices.length} invoices</span>
      </div>

      {invoices.length === 0 ? (
        <div className="text-center py-8 text-xs text-muted-foreground">
          <Receipt className="size-8 mx-auto mb-2 opacity-30" />
          No invoices generated yet. Check in a patient to create one.
        </div>
      ) : (
        <div className="space-y-1">
          {invoices.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-secondary/10 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`shrink-0 size-2 rounded-full ${inv.status === "paid" ? "bg-emerald-500" : inv.status === "issued" ? "bg-amber-500" : "bg-gray-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{inv.invoice_number}</div>
                  {(inv as unknown as Record<string, string>).lead_name && (
                    <div className="text-[10px] text-muted-foreground truncate">
                      {(inv as unknown as Record<string, string>).lead_name}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-semibold">KES {inv.total_amount.toLocaleString()}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status] || ""}`}>
                  {inv.status}
                </span>
                {inv.status !== "paid" && inv.status !== "void" && (
                  <button
                    onClick={() => setSelectedInvoice(inv)}
                    className="text-[10px] rounded-lg bg-primary/10 text-primary px-2 py-1 font-medium hover:bg-primary/20 transition-colors"
                  >
                    Pay
                  </button>
                )}
                <button
                  onClick={() => setHistoryInvoiceId(inv.id)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  title="Payment history"
                >
                  <Clock className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedInvoice && (
        <PaymentForm invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
      )}
      {historyInvoiceId != null && (
        <PaymentHistory invoiceId={historyInvoiceId} onClose={() => setHistoryInvoiceId(null)} />
      )}
    </div>
  );
}
