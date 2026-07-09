import { useState, useEffect, useRef, useCallback } from "react";

const isBrowser = typeof window !== "undefined";
const POLL_INTERVAL = 30_000;

export interface QueueStats {
  pending: number;
  failed: number;
  lastRun: number | null;
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(isBrowser ? navigator.onLine : true);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isBrowser) return;
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const poll = useCallback(async () => {
    if (!isBrowser) return;
    try {
      const mod = await import("@/lib/api/notifications.server");
      const result = await mod.triggerQueueProcessing({});
      setQueueStats((prev) => ({
        pending: 0,
        failed: result.failed,
        lastRun: Date.now(),
      }));
    } catch {
      // Silently ignore polling errors — queue telemetry is best-effort
    }
  }, []);

  useEffect(() => {
    if (!isBrowser) return;
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [poll]);

  const triggerSync = useCallback(async () => {
    if (!isBrowser || isSyncing) return;
    setIsSyncing(true);
    try {
      const mod = await import("@/lib/api/notifications.server");
      const result = await mod.triggerQueueProcessing({});
      setQueueStats((prev) => ({
        pending: 0,
        failed: result.failed,
        lastRun: Date.now(),
      }));
    } catch {
      // Silently ignore
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return { online, queueStats, isSyncing, triggerSync };
}
