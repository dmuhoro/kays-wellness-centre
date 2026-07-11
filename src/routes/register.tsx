import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, Mail, LockKeyhole, User, Loader2, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { registerOrganization } from "@/lib/api/registration.server";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await registerOrganization({
        data: { organizationName: orgName, adminName, email, password },
      });
      if (result.status === "ok") {
        setSuccess(true);
        setTimeout(() => navigate({ to: "/admin/triage" }), 1500);
      } else if (result.status === "db_unavailable") {
        setError("Database unavailable — please try again later");
      } else if (result.status === "slug_taken") {
        setError("An organization with this name already exists");
      } else if (result.status === "email_taken") {
        setError("This email is already registered to an organization");
      } else if (result.status === "error") {
        setError(result.message || "Registration failed");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="w-full max-w-sm text-center animate-fade-up">
          <div className="size-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="size-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold">Organization Created</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="text-center mb-8">
          <div className="size-16 rounded-2xl gradient-hero flex items-center justify-center mx-auto mb-5 shadow-glow">
            <Building2 className="size-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Register Your Clinic</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Create a new organization to get started.
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
            <label className="text-sm font-semibold mb-2 block">Organization Name</label>
            <div className="relative">
              <Building2 className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                minLength={2}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="e.g., Nairobi Wellness Clinic"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">Admin Name</label>
            <div className="relative">
              <User className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="Your full name"
              />
            </div>
          </div>

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
                minLength={6}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors"
                placeholder="At least 6 characters"
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
                <Loader2 className="size-4 animate-spin" /> Creating organization...
              </>
            ) : (
              <>
                <Building2 className="size-4" /> Create Organization
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center space-y-3">
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link to="/admin/login" className="text-primary hover:underline font-semibold">
              Sign in
            </Link>
          </p>
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
