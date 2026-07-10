import { useState } from "react";
import { Shield, LockKeyhole, Loader2, AlertCircle } from "lucide-react";

interface PasscodeGateProps {
  onUnlock: () => void;
}

const PASSCODE = "0726";

export function PasscodeGate({ onUnlock }: PasscodeGateProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (value === PASSCODE) {
        onUnlock();
      } else {
        setError(true);
      }
    }, 600);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-xs animate-fade-up text-center">
        <div className="size-14 rounded-2xl gradient-warm flex items-center justify-center mx-auto mb-5 shadow-glow">
          <Shield className="size-6 text-primary-foreground" />
        </div>
        <h1 className="text-lg font-bold">Diagnostics Passcode</h1>
        <p className="text-xs text-muted-foreground mt-2 mb-6">
          Enter the engineering passcode to access the diagnostics console.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <LockKeyhole className="size-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              required
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-background focus:border-primary outline-none transition-colors text-center text-lg tracking-widest"
              placeholder="* * * *"
              maxLength={4}
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-600">
              <AlertCircle className="size-4 shrink-0" />
              Incorrect passcode.
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl gradient-hero text-primary-foreground font-semibold disabled:opacity-50 hover:shadow-glow transition-all"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
            {loading ? "Checking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
