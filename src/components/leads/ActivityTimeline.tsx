import { X, MessageCircle, RefreshCw, AlertTriangle, Phone, Calendar, Trash2 } from "lucide-react";
import { useLeadInteractions } from "@/hooks/usePipelineActivity";
import type { InteractionRow } from "@/lib/api/interactions.server";
import { format } from "date-fns";

const eventIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  created: Calendar,
  drag: RefreshCw,
  message_sent: MessageCircle,
  message_received: MessageCircle,
  cancellation_alert: AlertTriangle,
  lead_deleted: Trash2,
  dispatched: Phone,
};

const eventLabels: Record<string, string> = {
  created: "Lead Created",
  drag: "Status Changed",
  message_sent: "Message Sent",
  message_received: "Message Received",
  cancellation_alert: "Cancellation Alert",
  lead_deleted: "Lead Deleted",
  dispatched: "Message Dispatched",
};

function formatMetadata(meta: Record<string, unknown>): string {
  if (meta.from_stage && meta.to_stage)
    return `${String(meta.from_stage).replace("_", " ")} → ${String(meta.to_stage).replace("_", " ")}`;
  if (meta.message)
    return `"${String(meta.message).slice(0, 80)}${(meta.message as string).length > 80 ? "..." : ""}"`;
  if (meta.provider)
    return `via ${meta.provider}`;
  if (meta.previous_status)
    return `Was: ${meta.previous_status}`;
  return "";
}

export function ActivityTimeline({
  leadId,
  leadName,
  onClose,
}: {
  leadId: number;
  leadName: string;
  onClose: () => void;
}) {
  const { interactions, loading } = useLeadInteractions(leadId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[80vh] flex flex-col animate-fade-up mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-sm">{leadName}</h2>
            <p className="text-[10px] text-muted-foreground">Lead #{leadId} · Activity Timeline</p>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-0">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Loading...</div>
          ) : interactions.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">No activity recorded yet.</div>
          ) : (
            interactions.map((interaction, i) => {
              const Icon = eventIcons[interaction.event_type] || RefreshCw;
              const label = eventLabels[interaction.event_type] || interaction.event_type;
              const detail = formatMetadata(interaction.metadata || {});
              const isLast = i === interactions.length - 1;

              return (
                <div key={interaction.id} className="relative flex gap-3 pb-4">
                  {!isLast && (
                    <div className="absolute left-[15px] top-7 bottom-0 w-px bg-border" />
                  )}
                  <div className="size-7 rounded-full bg-secondary/50 flex items-center justify-center shrink-0 z-10">
                    <Icon className="size-3 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="text-xs font-medium">{label}</div>
                    {detail && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">{detail}</div>
                    )}
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {format(new Date(interaction.created_at), "d MMM HH:mm")}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
