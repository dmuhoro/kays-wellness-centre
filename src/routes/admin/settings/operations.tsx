import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, Suspense } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, ArrowLeft, Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { fetchClinicConfig, saveClinicConfig } from "@/lib/api/clinic-config.server";
import { fetchResources, createResourceFn } from "@/lib/api/resources.server";
import type { ClinicConfigInput } from "@/lib/api/clinic-config.server";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DAY_LABELS: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const Route = createFileRoute("/admin/settings/operations")({
  head: () => ({
    meta: [
      { title: "Operations Settings — Kay's Wellness Centre" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OperationsSettingsPage,
});

function OperationsSettingsPage() {
  const { user } = useAuth();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center gap-4">
            <Link
              to="/admin/triage"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              Back to triage
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold">Operations Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure clinic hours, scheduling defaults, and automation parameters.
            </p>
          </div>

          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin" /></div>}>
            <SettingsForm />
          </Suspense>
        </div>
      </div>
    </ErrorBoundary>
  );
}

function SettingsForm() {
  const queryClient = useQueryClient();
  const { data: configResult } = useQuery({
    queryKey: ["clinic-config"],
    queryFn: () => fetchClinicConfig({}),
  });

  const { data: providersResult } = useQuery({
    queryKey: ["resources", "PROVIDER"],
    queryFn: () => fetchResources({ data: { type: "PROVIDER" } }),
  });

  const { data: roomsResult } = useQuery({
    queryKey: ["resources", "ROOM"],
    queryFn: () => fetchResources({ data: { type: "ROOM" } }),
  });

  const config = configResult?.status === "ok" ? configResult.config : null;
  const providers = providersResult?.status === "ok" ? providersResult.resources : [];
  const rooms = roomsResult?.status === "ok" ? roomsResult.resources : [];

  const [businessHours, setBusinessHours] = useState<Record<string, { open: string; close: string } | null>>({});
  const [slotDuration, setSlotDuration] = useState(30);
  const [triageTimeout, setTriageTimeout] = useState(45);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newProviderName, setNewProviderName] = useState("");
  const [newRoomName, setNewRoomName] = useState("");

  useEffect(() => {
    if (config) {
      setBusinessHours((config.business_hours as Record<string, { open: string; close: string } | null>) || {});
      setSlotDuration(config.slot_duration_minutes);
      setTriageTimeout(config.triage_timeout_minutes);
      setCustomKeywords(Array.isArray(config.custom_keywords) ? config.custom_keywords : []);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (input: ClinicConfigInput) => saveClinicConfig({ data: input }),
    onSuccess: () => {
      toast.success("Settings saved");
      queryClient.invalidateQueries({ queryKey: ["clinic-config"] });
    },
    onError: (err) => {
      toast.error("Failed to save settings", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: (name: string) => createResourceFn({ data: { name, type: "PROVIDER" } }),
    onSuccess: () => {
      toast.success("Provider added");
      setNewProviderName("");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (err) => {
      toast.error("Failed to add provider", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const createRoomMutation = useMutation({
    mutationFn: (name: string) => createResourceFn({ data: { name, type: "ROOM" } }),
    onSuccess: () => {
      toast.success("Room added");
      setNewRoomName("");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (err) => {
      toast.error("Failed to add room", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  const handleSave = () => {
    const invalidDays: string[] = [];
    for (const day of DAYS) {
      const h = businessHours[day];
      if (h) {
        const [oh, om] = h.open.split(":").map(Number);
        const [ch, cm] = h.close.split(":").map(Number);
        if (oh * 60 + om >= ch * 60 + cm) {
          invalidDays.push(DAY_LABELS[day]);
        }
      }
    }
    if (invalidDays.length > 0) {
      toast.error("Invalid business hours", {
        description: `${invalidDays.join(", ")}: open time must precede close time`,
      });
      return;
    }
    if (triageTimeout < 5) {
      toast.error("Invalid triage timeout", {
        description: "Triage timeout cannot be less than 5 minutes",
      });
      return;
    }

    saveMutation.mutate({
      business_hours: businessHours,
      slot_duration_minutes: slotDuration,
      triage_timeout_minutes: triageTimeout,
      custom_keywords: customKeywords,
    });
  };

  const toggleDay = (day: string) => {
    setBusinessHours((prev) => {
      if (prev[day]) {
        const next = { ...prev };
        next[day] = null;
        return next;
      }
      return { ...prev, [day]: { open: "08:00", close: "17:00" } };
    });
  };

  const updateHour = (day: string, field: "open" | "close", value: string) => {
    setBusinessHours((prev) => {
      const current = prev[day];
      if (!current) return prev;
      return { ...prev, [day]: { ...current, [field]: value } };
    });
  };

  const addKeyword = () => {
    const trimmed = newKeyword.trim().toLowerCase();
    if (!trimmed) return;
    if (customKeywords.includes(trimmed)) {
      toast.error("Duplicate keyword");
      return;
    }
    if (trimmed.length > 50) {
      toast.error("Keyword too long (max 50 characters)");
      return;
    }
    setCustomKeywords((prev) => [...prev, trimmed]);
    setNewKeyword("");
  };

  const removeKeyword = (kw: string) => {
    setCustomKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const isDirty =
    config &&
    (config.slot_duration_minutes !== slotDuration ||
      config.triage_timeout_minutes !== triageTimeout ||
      JSON.stringify(config.custom_keywords) !== JSON.stringify(customKeywords) ||
      JSON.stringify(config.business_hours) !== JSON.stringify(businessHours));

  return (
    <div className="space-y-10">
      {/* Business Hours */}
      <section className="glass rounded-2xl p-6 border-warm">
        <h2 className="text-lg font-semibold mb-4">Business Hours</h2>
        <div className="space-y-3">
          {DAYS.map((day) => {
            const hours = businessHours[day];
            return (
              <div key={day} className="flex items-center gap-3">
                <label className="flex items-center gap-2 w-36">
                  <input
                    type="checkbox"
                    checked={!!hours}
                    onChange={() => toggleDay(day)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium">{DAY_LABELS[day]}</span>
                </label>
                {hours && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={hours.open}
                      onChange={(e) => updateHour(day, "open", e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={hours.close}
                      onChange={(e) => updateHour(day, "close", e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Scheduling Defaults */}
      <section className="glass rounded-2xl p-6 border-warm">
        <h2 className="text-lg font-semibold mb-4">Scheduling Defaults</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-1.5">Slot Duration (minutes)</label>
            <select
              value={slotDuration}
              onChange={(e) => setSlotDuration(Number(e.target.value))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Triage Timeout (minutes)</label>
            <input
              type="number"
              min={5}
              max={1440}
              value={triageTimeout}
              onChange={(e) => setTriageTimeout(Math.max(5, Number(e.target.value)))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {triageTimeout < 5 && (
              <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="size-3" />
                Minimum 5 minutes
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Custom Keywords */}
      <section className="glass rounded-2xl p-6 border-warm">
        <h2 className="text-lg font-semibold mb-1">Custom Keywords</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Additional opt-out or escalation keywords detected on inbound WhatsApp messages.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {customKeywords.map((kw) => (
            <span
              key={kw}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium"
            >
              {kw}
              <button
                onClick={() => removeKeyword(kw)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
            placeholder="Add keyword..."
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={addKeyword}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" />
            Add
          </button>
        </div>
      </section>

      {/* Resources */}
      <section className="glass rounded-2xl p-6 border-warm">
        <h2 className="text-lg font-semibold mb-4">Resources</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Providers */}
          <div>
            <h3 className="text-sm font-medium mb-2">Providers</h3>
            <ul className="space-y-1 mb-3">
              {providers.map((p) => (
                <li key={p.id} className="text-sm text-muted-foreground">{p.name}</li>
              ))}
              {providers.length === 0 && (
                <li className="text-sm text-muted-foreground italic">No providers configured</li>
              )}
            </ul>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createProviderMutation.mutate(newProviderName))}
                placeholder="Dr. Name..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => createProviderMutation.mutate(newProviderName)}
                disabled={!newProviderName.trim() || createProviderMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {createProviderMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-4" />}
                Add
              </button>
            </div>
          </div>
          {/* Rooms */}
          <div>
            <h3 className="text-sm font-medium mb-2">Rooms</h3>
            <ul className="space-y-1 mb-3">
              {rooms.map((r) => (
                <li key={r.id} className="text-sm text-muted-foreground">{r.name}</li>
              ))}
              {rooms.length === 0 && (
                <li className="text-sm text-muted-foreground italic">No rooms configured</li>
              )}
            </ul>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createRoomMutation.mutate(newRoomName))}
                placeholder="Room name..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => createRoomMutation.mutate(newRoomName)}
                disabled={!newRoomName.trim() || createRoomMutation.isPending}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {createRoomMutation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-4" />}
                Add
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Save Button */}
      <div className="flex justify-end pb-12">
        <button
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-elegant hover:bg-primary/90 disabled:opacity-50 transition-all"
        >
          {saveMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saveMutation.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
