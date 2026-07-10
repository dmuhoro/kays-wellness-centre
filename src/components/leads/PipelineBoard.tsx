import { useState, memo, useCallback } from "react";
import {
  Phone,
  MessageCircle,
  Loader2,
  ChevronDown,
  Check,
  Trash2,
} from "lucide-react";
import type { LeadRow } from "@/lib/api/leads.server";
import { useUpdateLead, useDeleteLead } from "@/hooks/useLeads";
import { useMutation } from "@tanstack/react-query";
import { dispatchLeadMessage } from "@/lib/api/dispatch.server";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { TriagePriority } from "@/hooks/clinic-os-types";

export const PIPELINE_STAGES = [
  { key: "pending", label: "New", color: "bg-sky-500" },
  { key: "contacted", label: "Triage Pending", color: "bg-amber-500" },
  { key: "scheduled", label: "Scheduled", color: "bg-emerald-500" },
  { key: "converted", label: "Checked-In", color: "bg-violet-500" },
  { key: "closed", label: "Dropped", color: "bg-muted-foreground/50" },
] as const;

const priorityColor: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-emerald-500",
};

const priorityLabel: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const priorityOptions: TriagePriority[] = ["high", "medium", "low"];
const statusOptionsForStage: Record<string, string[]> = {
  pending: ["pending", "contacted", "closed"],
  contacted: ["contacted", "scheduled", "closed"],
  scheduled: ["scheduled", "converted", "closed"],
  converted: ["converted", "closed"],
  closed: ["closed", "pending"],
};

function LeadCard({
  lead,
  onDragStart,
}: {
  lead: LeadRow;
  onDragStart: (id: number) => void;
}) {
  const { mutate: updateLead, mutatingIds: updateMutatingIds } = useUpdateLead();
  const { mutate: deleteLead, mutatingIds: deleteMutatingIds } = useDeleteLead();
  const queryClient = useQueryClient();
  const [openPriority, setOpenPriority] = useState(false);
  const [openStatus, setOpenStatus] = useState(false);

  const isMutating = updateMutatingIds.has(lead.id) || deleteMutatingIds.has(lead.id);

  const dispatchMutation = useMutation({
    mutationFn: async ({
      leadId,
      messageType,
    }: {
      leadId: number;
      messageType: "confirmation" | "triage_followup" | "reminder";
    }) => {
      const result = await dispatchLeadMessage({ data: { leadId, messageType } });
      return result;
    },
    onSuccess: (result, vars) => {
      if (result.status === "dispatched") {
        toast.success("Message sent", {
          description: `Lead #${vars.leadId}: ${vars.messageType} dispatched via ${result.provider}`,
        });
      } else if (result.status === "dispatch_failed") {
        toast.error("Message failed", {
          description: result.error || "Could not send message",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (_err, vars) => {
      toast.error("Dispatch failed", {
        description: `Could not send message for lead #${vars.leadId}`,
      });
    },
  });

  const handleDelete = useCallback(() => {
    if (window.confirm(`Delete lead for ${lead.name}?`)) {
      deleteLead(lead.id);
    }
  }, [lead, deleteLead]);

  const handleMessage = useCallback(() => {
    dispatchMutation.mutate({ leadId: lead.id, messageType: "triage_followup" });
  }, [lead.id, dispatchMutation]);

  const handleConfirm = useCallback(() => {
    dispatchMutation.mutate({ leadId: lead.id, messageType: "confirmation" });
  }, [lead.id, dispatchMutation]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(lead.id)}
      className={`group relative rounded-xl border border-border bg-card p-3 mb-2 cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md border-l-4 ${priorityColor[lead.priority] || "border-l-border"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{lead.name}</span>
            {isMutating && <Loader2 className="size-3 animate-spin shrink-0 text-muted-foreground" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {lead.email}
          </div>
          {lead.phone && (
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Phone className="size-3" /> {lead.phone}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <div className="relative">
          <button
            onClick={() => setOpenPriority(!openPriority)}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border hover:bg-secondary/50 transition-colors"
          >
            {priorityLabel[lead.priority] || lead.priority}
          </button>
          {openPriority && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenPriority(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 min-w-[90px] rounded-lg border border-border bg-popover shadow-md overflow-hidden">
                {priorityOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      updateLead({ id: lead.id, priority: opt });
                      setOpenPriority(false);
                    }}
                    className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] text-left hover:bg-secondary/50 transition-colors"
                  >
                    {opt === lead.priority && <Check className="size-2.5" />}
                    <span className={opt === lead.priority ? "" : "ml-4"}>{priorityLabel[opt]}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {lead.status !== "closed" && lead.status !== "converted" && (
          <button
            onClick={handleMessage}
            disabled={dispatchMutation.isPending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border hover:bg-sky-500/10 hover:border-sky-500/30 transition-colors disabled:opacity-50"
            title="Send follow-up message"
          >
            {dispatchMutation.isPending && dispatchMutation.variables?.leadId === lead.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <MessageCircle className="size-3" />
            )}
            Message
          </button>
        )}
        {lead.status === "scheduled" && (
          <button
            onClick={handleConfirm}
            disabled={dispatchMutation.isPending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-colors disabled:opacity-50"
            title="Send confirmation message"
          >
            {dispatchMutation.isPending && dispatchMutation.variables?.leadId === lead.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Check className="size-3" />
            )}
            Confirm
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setOpenStatus(!openStatus)}
            className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded hover:bg-secondary/50 transition-colors flex items-center gap-1"
          >
            Move <ChevronDown className="size-2.5" />
          </button>
          {openStatus && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpenStatus(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 min-w-[110px] rounded-lg border border-border bg-popover shadow-md overflow-hidden">
                {(statusOptionsForStage[lead.status] || ["pending", "contacted", "scheduled", "converted", "closed"]).map(
                  (opt) => (
                    <button
                      key={opt}
                      onClick={() => {
                        updateLead({ id: lead.id, status: opt });
                        setOpenStatus(false);
                      }}
                      className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] text-left hover:bg-secondary/50 transition-colors"
                    >
                      {opt === lead.status && <Check className="size-2.5" />}
                      <span className={opt === lead.status ? "" : "ml-4"}>
                        {opt.charAt(0).toUpperCase() + opt.slice(1)}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 size-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-all"
          title="Delete lead"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    </div>
  );
}

const PipelineColumn = memo(function PipelineColumn({
  stage,
  leads,
  onDragStart,
  onDrop,
  isDragOver,
  onDragOver,
  onDragLeave,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  leads: LeadRow[];
  onDragStart: (id: number) => void;
  onDrop: (stageKey: string) => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(stage.key)}
      className={`flex-1 min-w-[220px] max-w-[300px] rounded-2xl border border-border bg-secondary/10 p-3 transition-colors ${
        isDragOver ? "bg-primary/5 border-primary/30" : ""
      }`}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={`size-2.5 rounded-full ${stage.color}`} />
        <h3 className="text-xs font-semibold">{stage.label}</h3>
        <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full ml-auto">
          {leads.length}
        </span>
      </div>
      <div className="space-y-1 min-h-[60px]">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} onDragStart={onDragStart} />
        ))}
        {leads.length === 0 && (
          <div className="text-[11px] text-muted-foreground/50 text-center py-6">
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
});

export function PipelineBoard({ leads }: { leads: LeadRow[] }) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const { mutate: updateLead } = useUpdateLead();

  const handleDragStart = useCallback((id: number) => {
    setDraggedId(id);
  }, []);

  const handleDrop = useCallback(
    (stageKey: string) => {
      if (draggedId != null) {
        updateLead({ id: draggedId, status: stageKey });
      }
      setDraggedId(null);
      setDragOverStage(null);
    },
    [draggedId, updateLead],
  );

  const grouped = PIPELINE_STAGES.map((stage) => ({
    stage,
    leads: leads.filter((l) => l.status === stage.key),
  }));

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {grouped.map(({ stage, leads: stageLeads }) => (
        <PipelineColumn
          key={stage.key}
          stage={stage}
          leads={stageLeads}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          isDragOver={dragOverStage === stage.key}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverStage(stage.key);
          }}
          onDragLeave={() => setDragOverStage(null)}
        />
      ))}
    </div>
  );
}
