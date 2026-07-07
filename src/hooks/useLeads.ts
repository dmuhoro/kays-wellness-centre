import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchLeads, updateLead, deleteLead } from "@/lib/api/leads.server";
import type { LeadRow } from "@/lib/api/leads.server";

const LEADS_QUERY_KEY = ["leads"] as const;

export function useLeads() {
  return useSuspenseQuery<LeadRow[]>({
    queryKey: LEADS_QUERY_KEY,
    queryFn: () => fetchLeads({}),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useUpdateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: number; status?: string; priority?: "low" | "medium" | "high" }) =>
      updateLead({ data: input }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });
      const previous = queryClient.getQueryData<LeadRow[]>(LEADS_QUERY_KEY);

      if (previous) {
        queryClient.setQueryData<LeadRow[]>(LEADS_QUERY_KEY, (old) =>
          old?.map((lead) =>
            lead.id === input.id
              ? {
                  ...lead,
                  ...(input.status !== undefined ? { status: input.status } : {}),
                  ...(input.priority !== undefined ? { priority: input.priority } : {}),
                }
              : lead,
          ),
        );
      }

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
  });
}

export function useDeleteLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteLead({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: LEADS_QUERY_KEY });
      const previous = queryClient.getQueryData<LeadRow[]>(LEADS_QUERY_KEY);

      if (previous) {
        queryClient.setQueryData<LeadRow[]>(LEADS_QUERY_KEY, (old) =>
          old?.filter((lead) => lead.id !== id),
        );
      }

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(LEADS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    },
  });
}
