import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shield, LockKeyhole, Mail, Loader2, ArrowLeft, AlertCircle } from "lucide-react";
import { login } from "@/lib/auth.server";

// This route only imports the login serverFn — session helpers (getCurrentOrgId etc.)
// are imported only by other .server.ts modules on the server side.

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Admin Login — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login({ data: { email, password } });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.success) {
        navigate({ to: "/admin/triage" });
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="size-16 rounded-2xl gradient-warm flex items-center justify-center mx-auto mb-5 shadow-glow">
            <Shield className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Admin Sign In</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Secure access for clinical staff.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 border-warm space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-600">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-semibold mb-2 block">Email</label>
            <div className="relative">
              <Mail className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Password</label>
            <div className="relative">
              <LockKeyhole className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-50 hover:shadow-glow transition-all"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Signing in...
              </>
            ) : (
              <>
                <LockKeyhole className="size-4" /> Sign In
              </>
            )}
          </button>
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
