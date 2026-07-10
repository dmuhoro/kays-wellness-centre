import { useState, useEffect, memo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, User, DoorOpen, Users } from "lucide-react";
import { getAvailableSlots, getAvailabilityRange } from "@/lib/api/scheduling.server";
import { dispatchLeadMessage } from "@/lib/api/dispatch.server";
import { scheduleAppointment, fetchResources } from "@/lib/api/resources.server";
import { toast } from "sonner";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, parse, isBefore } from "date-fns";
import type { LeadRow } from "@/lib/api/leads.server";
import type { ResourceRow } from "@/lib/api/resources.server";

interface CalendarGridProps {
  leads: LeadRow[];
  onSchedule: (leadId: number, timestamp: string) => void;
}

interface DayCell {
  date: Date;
  slots: string[];
  booked: LeadRow[];
}

const RESOURCE_LABELS: Record<string, string> = {
  PROVIDER: "Provider",
  ROOM: "Room",
};

function QuickScheduleDrawer({
  leads,
  date,
  slots,
  providers,
  rooms,
  onClose,
  onSchedule,
}: {
  leads: LeadRow[];
  date: Date;
  slots: string[];
  providers: ResourceRow[];
  rooms: ResourceRow[];
  onClose: () => void;
  onSchedule: (leadId: number, timestamp: string, providerId?: number | null, roomId?: number | null) => void;
}) {
  const triagePendingLeads = leads.filter((l) => l.status === "contacted" && !l.appointment_timestamp);
  const [assignments, setAssignments] = useState<Record<number, { slot: string; providerId?: number | null; roomId?: number | null }>>({});

  const handleAssign = (leadId: number, field: "slot" | "providerId" | "roomId", value: string | number | null) => {
    setAssignments((prev) => ({
      ...prev,
      [leadId]: { ...prev[leadId] ?? {}, [field]: value },
    }));
  };

  const handleConfirm = (leadId: number) => {
    const a = assignments[leadId];
    if (!a?.slot) return;
    onSchedule(leadId, a.slot, a.providerId ?? null, a.roomId ?? null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-up mx-4"
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
              <div className="grid grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const slotTime = parse(format(new Date(slot), "HH:mm"), "HH:mm", new Date());
                  return (
                    <div key={slot} className="border border-border rounded-lg p-2 text-center">
                      <div className="text-[11px] font-semibold">{format(new Date(slot), "HH:mm")}</div>
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
              <div className="space-y-2">
                {triagePendingLeads.map((lead) => {
                  const a = assignments[lead.id];
                  return (
                    <div key={lead.id} className="border border-border rounded-lg p-3 space-y-2 hover:bg-secondary/10 transition-colors">
                      <div>
                        <div className="text-xs font-medium">{lead.name}</div>
                        <div className="text-[10px] text-muted-foreground">{lead.service}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <select
                          onChange={(e) => handleAssign(lead.id, "slot", e.target.value)}
                          defaultValue=""
                          className="text-[10px] border border-border rounded-lg px-2 py-1.5 bg-background"
                        >
                          <option value="" disabled>Slot</option>
                          {slots.map((slot) => (
                            <option key={slot} value={slot}>
                              {format(new Date(slot), "HH:mm")}
                            </option>
                          ))}
                        </select>
                        {providers.length > 0 && (
                          <select
                            onChange={(e) => handleAssign(lead.id, "providerId", e.target.value ? Number(e.target.value) : null)}
                            defaultValue=""
                            className="text-[10px] border border-border rounded-lg px-2 py-1.5 bg-background"
                          >
                            <option value="">Provider</option>
                            {providers.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        )}
                        {rooms.length > 0 && (
                          <select
                            onChange={(e) => handleAssign(lead.id, "roomId", e.target.value ? Number(e.target.value) : null)}
                            defaultValue=""
                            className="text-[10px] border border-border rounded-lg px-2 py-1.5 bg-background"
                          >
                            <option value="">Room</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button
                        onClick={() => handleConfirm(lead.id)}
                        disabled={!a?.slot}
                        className="w-full text-[10px] font-medium rounded-lg py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {a?.slot ? `Schedule at ${format(new Date(a.slot), "HH:mm")}` : "Select a time slot"}
                      </button>
                    </div>
                  );
                })}
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
  resourceFilter,
  onSelectSlot,
}: {
  day: Date;
  isToday: boolean;
  isPast: boolean;
  slots: string[];
  booked: LeadRow[];
  resourceFilter: string | null;
  onSelectSlot: () => void;
}) {
  const filteredBooked = resourceFilter
    ? booked.filter((l) => {
        if (resourceFilter.startsWith("provider:")) {
          return l.provider_id === Number(resourceFilter.slice(9));
        }
        if (resourceFilter.startsWith("room:")) {
          return l.room_id === Number(resourceFilter.slice(5));
        }
        return true;
      })
    : booked;

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

      {filteredBooked.length > 0 && (
        <div className="space-y-1 mb-2">
          {filteredBooked.slice(0, 3).map((lead) => (
            <div
              key={lead.id}
              className="text-[9px] bg-emerald-500/10 text-emerald-600 rounded px-1.5 py-0.5 truncate font-medium"
              title={`${lead.name}${lead.provider_id ? ` (Provider: ${lead.provider_id})` : ""}${lead.room_id ? ` [Room: ${lead.room_id}]` : ""}`}
            >
              {lead.name}
            </div>
          ))}
          {filteredBooked.length > 3 && (
            <div className="text-[8px] text-muted-foreground text-center">+{filteredBooked.length - 3} more</div>
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
  const [resourceFilter, setResourceFilter] = useState<string | null>(null);

  const { data: providersResult } = useQuery({
    queryKey: ["resources", "PROVIDER"],
    queryFn: () => fetchResources({ data: { type: "PROVIDER" } }),
  });
  const { data: roomsResult } = useQuery({
    queryKey: ["resources", "ROOM"],
    queryFn: () => fetchResources({ data: { type: "ROOM" } }),
  });

  const providers = providersResult?.status === "ok" ? providersResult.resources : [];
  const rooms = roomsResult?.status === "ok" ? roomsResult.resources : [];

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

  const scheduleMutation = useMutation({
    mutationFn: (input: { leadId: number; timestamp: string; providerId?: number | null; roomId?: number | null }) =>
      scheduleAppointment({
        data: {
          leadId: input.leadId,
          appointmentTimestamp: input.timestamp,
          providerId: input.providerId ?? null,
          roomId: input.roomId ?? null,
        },
      }),
    onSuccess: (result, variables) => {
      if (result.status === "conflict") {
        toast.error("Resource conflict", {
          description: `This provider or room is already booked for the selected time slot.`,
        });
        return;
      }
      toast.success("Appointment scheduled", {
        description: `Lead #${variables.leadId} → ${format(new Date(variables.timestamp), "d MMM HH:mm")}`,
      });
      dispatchLeadMessage({ data: { leadId: variables.leadId, messageType: "confirmation" } }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setSelectedDay(null);
      onSchedule(variables.leadId, variables.timestamp);
    },
    onError: (err, variables) => {
      toast.error("Failed to schedule", {
        description: err instanceof Error ? err.message : `Could not book slot for lead #${variables.leadId}`,
      });
    },
  });

  const handleSchedule = useCallback(
    (leadId: number, timestamp: string, providerId?: number | null, roomId?: number | null) => {
      scheduleMutation.mutate({ leadId, timestamp, providerId, roomId });
    },
    [scheduleMutation],
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

      {providers.length + rooms.length > 0 && (
        <div className="flex items-center gap-2 mb-4">
          <Users className="size-3.5 text-muted-foreground" />
          <select
            value={resourceFilter ?? ""}
            onChange={(e) => setResourceFilter(e.target.value || null)}
            className="text-[11px] border border-border rounded-lg px-2 py-1.5 bg-background flex-1"
          >
            <option value="">All resources</option>
            {providers.length > 0 && (
              <optgroup label="Providers">
                {providers.map((p) => (
                  <option key={p.id} value={`provider:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
            {rooms.length > 0 && (
              <optgroup label="Rooms">
                {rooms.map((r) => (
                  <option key={r.id} value={`room:${r.id}`}>
                    {r.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      )}

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
              resourceFilter={resourceFilter}
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
          providers={providers}
          rooms={rooms}
          onClose={() => setSelectedDay(null)}
          onSchedule={handleSchedule}
        />
      )}
    </div>
  );
}
