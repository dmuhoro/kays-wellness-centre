import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, Suspense } from "react";
import { Shield, ArrowLeft, Receipt, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { BillingLedger } from "@/components/finance/BillingLedger";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "Billing Ledger — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const navigate = useNavigate();
  const { loading, authenticated } = useAuth();

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
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <Link
            to="/admin/dashboard"
            className="size-8 rounded-lg glass flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="size-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="font-bold text-lg">Billing Ledger</h1>
            <p className="text-xs text-muted-foreground">Invoice management and payment recording</p>
          </div>
        </div>

        <ErrorBoundary>
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-secondary/30" />}>
            <div className="glass rounded-2xl border-warm p-5">
              <BillingLedger />
            </div>
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
