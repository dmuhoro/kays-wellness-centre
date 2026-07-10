import { useState, useEffect, memo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { getAvailableSlots, getAvailabilityRange } from "@/lib/api/scheduling.server";
import { useUpdateLead } from "@/hooks/useLeads";
import { dispatchLeadMessage } from "@/lib/api/dispatch.server";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, parse, isBefore } from "date-fns";
import type { LeadRow } from "@/lib/api/leads.server";

interface CalendarGridProps {
  leads: LeadRow[];
  onSchedule: (leadId: number, timestamp: string) => void;
}

interface DayCell {
  date: Date;
  slots: string[];
  booked: LeadRow[];
}

function QuickScheduleDrawer({
  leads,
  date,
  slots,
  onClose,
  onSchedule,
}: {
  leads: LeadRow[];
  date: Date;
  slots: string[];
  onClose: () => void;
  onSchedule: (leadId: number, timestamp: string) => void;
}) {
  const triagePendingLeads = leads.filter((l) => l.status === "contacted" && !l.appointment_timestamp);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[80vh] flex flex-col animate-fade-up mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold text-sm">
            Quick Schedule — {format(date, "d MMM yyyy")}
          </h2>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {slots.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No available slots on this day.</p>
          ) : (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Available Slots
              </p>
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const slotTime = parse(format(new Date(slot), "HH:mm"), "HH:mm", new Date());
                  return (
                    <div key={slot} className="border border-border rounded-lg p-2 text-center">
                      <div className="text-[11px] font-semibold">{format(new Date(slot), "HH:mm")}</div>
                      <div className="text-[9px] text-muted-foreground">60 min</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {triagePendingLeads.length > 0 && slots.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                Assign to Lead
              </p>
              <div className="space-y-1">
                {triagePendingLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30 transition-colors">
                    <div>
                      <div className="text-xs font-medium">{lead.name}</div>
                      <div className="text-[10px] text-muted-foreground">{lead.service}</div>
                    </div>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          onSchedule(lead.id, e.target.value);
                        }
                      }}
                      defaultValue=""
                      className="text-[10px] border border-border rounded-lg px-2 py-1 bg-background"
                    >
                      <option value="" disabled>Pick slot</option>
                      {slots.map((slot) => (
                        <option key={slot} value={slot}>
                          {format(new Date(slot), "HH:mm")}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {triagePendingLeads.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No triage-pending leads available to schedule.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const DayColumn = memo(function DayColumn({
  day,
  isToday,
  isPast,
  slots,
  booked,
  onSelectSlot,
}: {
  day: Date;
  isToday: boolean;
  isPast: boolean;
  slots: string[];
  booked: LeadRow[];
  onSelectSlot: () => void;
}) {
  return (
    <div
      className={`flex-1 min-w-[100px] rounded-xl border p-2 transition-colors ${
        isToday ? "border-primary/40 bg-primary/[0.02]" : "border-border"
      } ${isPast ? "opacity-50" : ""}`}
    >
      <div className="text-center mb-2">
        <div className="text-[10px] text-muted-foreground uppercase">{format(day, "EEE")}</div>
        <div className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>{format(day, "d")}</div>
      </div>

      {booked.length > 0 && (
        <div className="space-y-1 mb-2">
          {booked.slice(0, 3).map((lead) => (
            <div
              key={lead.id}
              className="text-[9px] bg-emerald-500/10 text-emerald-600 rounded px-1.5 py-0.5 truncate font-medium"
            >
              {lead.name}
            </div>
          ))}
          {booked.length > 3 && (
            <div className="text-[8px] text-muted-foreground text-center">+{booked.length - 3} more</div>
          )}
        </div>
      )}

      {!isPast && slots.length > 0 && (
        <button
          onClick={onSelectSlot}
          className="w-full mt-1 flex items-center justify-center gap-1 text-[9px] text-muted-foreground hover:text-primary rounded-lg py-1 hover:bg-primary/5 transition-colors"
        >
          <Plus className="size-2.5" />
          {slots.length} slots
        </button>
      )}
    </div>
  );
});

export function CalendarGrid({ leads, onSchedule }: CalendarGridProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [slotsByDay, setSlotsByDay] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const { mutate: updateLead } = useUpdateLead();

  const weekEnd = addDays(weekStart, 6);
  const startStr = format(weekStart, "yyyy-MM-dd");
  const endStr = format(weekEnd, "yyyy-MM-dd");

  useEffect(() => {
    setLoading(true);
    getAvailabilityRange({ data: { startDate: startStr, endDate: endStr } })
      .then(setSlotsByDay)
      .catch(() => setSlotsByDay({}))
      .finally(() => setLoading(false));
  }, [startStr, endStr]);

  const days: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dateKey = format(date, "yyyy-MM-dd");
    const booked = leads.filter(
      (l) => l.appointment_timestamp && isSameDay(new Date(l.appointment_timestamp), date),
    );
    days.push({
      date,
      slots: slotsByDay[dateKey] || [],
      booked,
    });
  }

  const today = new Date();

  const handlePrevWeek = () => setWeekStart((w) => subWeeks(w, 1));
  const handleNextWeek = () => setWeekStart((w) => addWeeks(w, 1));

  const queryClient = useQueryClient();

  const handleSchedule = useCallback(
    (leadId: number, timestamp: string) => {
      updateLead(
        { id: leadId, status: "scheduled", appointment_timestamp: timestamp },
        {
          onSuccess: () => {
            toast.success("Appointment scheduled", {
              description: `Lead #${leadId} → ${format(new Date(timestamp), "d MMM HH:mm")}`,
            });
            dispatchLeadMessage({ data: { leadId, messageType: "confirmation" } }).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ["leads"] });
            setSelectedDay(null);
            onSchedule(leadId, timestamp);
          },
          onError: () => {
            toast.error("Failed to schedule", { description: `Could not book slot for lead #${leadId}` });
          },
        },
      );
    },
    [updateLead, onSchedule, queryClient],
  );

  const selectedDaySlots = selectedDay
    ? slotsByDay[format(selectedDay, "yyyy-MM-dd")] || []
    : [];

  return (
    <div className="glass rounded-2xl border-warm p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePrevWeek}
          className="size-7 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-sm font-semibold">
          {format(weekStart, "d MMM")} — {format(weekEnd, "d MMM yyyy")}
        </div>
        <button
          onClick={handleNextWeek}
          className="size-7 rounded-lg flex items-center justify-center hover:bg-secondary/50 transition-colors"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex gap-2">
          {days.map((day) => (
            <DayColumn
              key={format(day.date, "yyyy-MM-dd")}
              day={day.date}
              isToday={isSameDay(day.date, today)}
              isPast={isBefore(day.date, today) && !isSameDay(day.date, today)}
              slots={day.slots}
              booked={day.booked}
              onSelectSlot={() => setSelectedDay(day.date)}
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-emerald-500/50" /> Booked
        </span>
        <span className="flex items-center gap-1">
          <Plus className="size-2.5" /> Available slots
        </span>
      </div>

      {selectedDay && (
        <QuickScheduleDrawer
          leads={leads}
          date={selectedDay}
          slots={selectedDaySlots}
          onClose={() => setSelectedDay(null)}
          onSchedule={handleSchedule}
        />
      )}
    </div>
  );
}
