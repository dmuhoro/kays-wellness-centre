import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchLeads, updateLead, deleteLead } from "@/lib/api/leads.server";
import type { LeadRow, FetchLeadsResult } from "@/lib/api/leads.server";
import type { TriagePriority } from "./clinic-os-types";

export const LEADS_QUERY_KEY = ["leads"] as const;

export function useLeads() {
  return useSuspenseQuery<FetchLeadsResult>({
    queryKey: LEADS_QUERY_KEY,
    queryFn: () => fetchLeads({}),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

type UpdateInput = { id: number; status?: string; priority?: TriagePriority; appointment_timestamp?: string | null };
type DeleteInput = number;

export function useUpdateLead() {
  const queryClient = useQueryClient();
  const [mutatingIds, setMutatingIds] = useState<Set<number>>(new Set());

  const mutation = useMutation({
    mutationFn: (input: UpdateInput) => updateLead({ data: input }),
    onMutate: async (input) => {
      setMutatingIds((prev) => new Set([...prev, input.id]));
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });
      const previous = queryClient.getQueryData<FetchLeadsResult>(LEADS_QUERY_KEY);

      if (previous?.source === "db") {
        queryClient.setQueryData<FetchLeadsResult>(LEADS_QUERY_KEY, {
          ...previous,
          rows: previous.rows.map((lead) =>
            lead.id === input.id
              ? {
                  ...lead,
                  ...(input.status !== undefined ? { status: input.status } : {}),
                  ...(input.priority !== undefined ? { priority: input.priority } : {}),
                }
              : lead,
          ),
        });
      }

      return { previous };
    },
    onSuccess: (_data, input) => {
      const label = input.priority !== undefined ? "Priority" : "Status";
      const value = input.priority ?? input.status;
      toast.success(`${label} updated`, {
        description: `Lead #${input.id}: ${label.toLowerCase()} → ${value}`,
      });
    },
    onError: (_err, input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previous);
      }
      toast.error(`Failed to update lead #${input.id}`, {
        description: _err instanceof Error ? _err.message : "Server error — your change has been reverted.",
      });
    },
    onSettled: (_data, _err, input) => {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(input.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
  });

  return { ...mutation, mutatingIds };
}

export function useDeleteLead() {
  const queryClient = useQueryClient();
  const [mutatingIds, setMutatingIds] = useState<Set<number>>(new Set());

  const mutation = useMutation({
    mutationFn: (id: DeleteInput) => deleteLead({ data: { id } }),
    onMutate: async (id) => {
      setMutatingIds((prev) => new Set([...prev, id]));
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });
      const previous = queryClient.getQueryData<FetchLeadsResult>(LEADS_QUERY_KEY);

      if (previous?.source === "db") {
        queryClient.setQueryData<FetchLeadsResult>(LEADS_QUERY_KEY, {
          ...previous,
          rows: previous.rows.filter((lead) => lead.id !== id),
        });
      }

      return { previous };
    },
    onSuccess: (_data, id) => {
      toast.success("Lead deleted", {
        description: `Lead #${id} removed from queue.`,
      });
    },
    onError: (_err, id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previous);
      }
      toast.error(`Failed to delete lead #${id}`, {
        description: _err instanceof Error ? _err.message : "Server error — lead has been restored.",
      });
    },
    onSettled: (_data, _err, id) => {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
  });

  return { ...mutation, mutatingIds };
}
