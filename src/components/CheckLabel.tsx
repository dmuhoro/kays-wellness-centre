import { CheckCircle, XCircle } from "lucide-react";

interface CheckLabelProps {
  ok: boolean;
  label: string;
}

export function CheckLabel({ ok, label }: CheckLabelProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-secondary/30 px-4 py-3 text-sm">
      {ok ? (
        <CheckCircle className="size-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="size-4 text-red-500 shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
