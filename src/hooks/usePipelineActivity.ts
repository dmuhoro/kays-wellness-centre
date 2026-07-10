import { useState, useEffect, useCallback } from "react";
import { getLeadsWithPendingReplies, getLeadInteractions, logInteraction } from "@/lib/api/interactions.server";
import type { InteractionRow } from "@/lib/api/interactions.server";
import { useQueryClient } from "@tanstack/react-query";

export function usePendingReplies() {
  const [pendingReplyIds, setPendingReplyIds] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const ids = await getLeadsWithPendingReplies({});
      setPendingReplyIds(new Set(ids));
    } catch {
      // silently fail — best-effort
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { pendingReplyIds, refresh };
}

export function useLeadInteractions(leadId: number | null) {
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (leadId == null) {
      setInteractions([]);
      return;
    }
    setLoading(true);
    getLeadInteractions({ data: { leadId } })
      .then(setInteractions)
      .catch(() => setInteractions([]))
      .finally(() => setLoading(false));
  }, [leadId]);

  return { interactions, loading };
}

export function useLogDragInteraction() {
  const queryClient = useQueryClient();

  const logDrag = useCallback(
    async (leadId: number, fromStage: string, toStage: string) => {
      try {
        await logInteraction({
          data: {
            leadId,
            eventType: "drag",
            metadata: { from_stage: fromStage, to_stage: toStage },
          },
        });
        queryClient.invalidateQueries({ queryKey: ["interactions", leadId] });
      } catch {
        // silent
      }
    },
    [queryClient],
  );

  return { logDrag };
}
