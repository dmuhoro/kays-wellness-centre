import { useState } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Activity,
  AlertCircle,
} from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function NetworkStatus() {
  const [expanded, setExpanded] = useState(false);
  const { online, queueStats, isSyncing, triggerSync } = useNetworkStatus();

  const hasFailed = (queueStats?.failed ?? 0) > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Network status"
      >
        <span className="relative flex size-2">
          {online ? (
            <span className="absolute inset-0 rounded-full bg-emerald-500" />
          ) : (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping" />
              <span className="absolute inset-0 rounded-full bg-rose-500" />
            </>
          )}
        </span>
        <span className="hidden sm:inline">
          {online ? "Online" : "Offline"}
        </span>
        {isSyncing && (
          <RefreshCw className="size-3 animate-spin ml-1" />
        )}
        {hasFailed && (
          <AlertCircle className="size-3 text-amber-400 ml-1" />
        )}
      </button>

      {expanded && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setExpanded(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 min-w-[200px] rounded-xl border border-border bg-popover shadow-md p-3 space-y-2">
            <div className="flex items-center gap-2">
              {online ? (
                <Wifi className="size-3.5 text-emerald-500" />
              ) : (
                <WifiOff className="size-3.5 text-rose-500" />
              )}
              <span className="text-xs font-medium">
                {online ? "Connected" : "Disconnected"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Activity className="size-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Queue: {hasFailed ? `${queueStats?.failed} failed` : "No failures"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw className="size-3.5 text-sky-500 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {isSyncing ? "Syncing..." : "Idle"}
              </span>
            </div>

            {queueStats?.lastRun && (
              <div className="text-[10px] text-muted-foreground/60 pt-1 border-t border-border">
                Last sync: {new Date(queueStats.lastRun).toLocaleTimeString()}
              </div>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                triggerSync();
              }}
              disabled={isSyncing}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="size-3 animate-spin" /> Running...
                </>
              ) : (
                <>
                  <RefreshCw className="size-3" /> Sync Now
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
