import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ClinicOSLeadPacket, SubmitStatus } from "./clinic-os-types";
import { computeTriagePriority, sanitizeInput, collectTelemetry } from "./clinic-os-types";
import { submitLead } from "@/lib/api/leads.server";
import { LEADS_QUERY_KEY } from "./useLeads";

const STORAGE_KEY = "kwc_pending_submissions";
const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function readEnv(name: string): string | undefined {
  if (
    typeof import.meta !== "undefined" &&
    typeof import.meta.env !== "undefined" &&
    typeof (import.meta.env as Record<string, unknown>)[name] === "string"
  ) {
    return (import.meta.env as Record<string, unknown>)[name] as string;
  }
  return undefined;
}

const CLINIC_OS_WEBHOOK_URL = readEnv("NEXT_PUBLIC_CLINIC_OS_WEBHOOK_URL");

export function getPending(): ClinicOSLeadPacket[] {
  if (!isBrowser) return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function addPending(packet: ClinicOSLeadPacket) {
  if (!isBrowser) return;
  const pending = getPending();
  pending.push(packet);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

function clearPending() {
  if (!isBrowser) return;
  localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };

async function transmitPacket(packet: ClinicOSLeadPacket): Promise<void> {
  if (CLINIC_OS_WEBHOOK_URL) {
    const res = await fetch(CLINIC_OS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Clinic OS returned ${res.status}`);
    }
    return;
  }

  const result = await submitLead({
    data: {
      name: packet.formData.name,
      phone: packet.formData.phone || "",
      email: packet.formData.email,
      service: packet.formData.service,
      channel: packet.formData.channel || "",
      priority: packet.triage_priority,
      raw_payload: packet,
    },
  });

  if (result.status === "db_unavailable") {
    console.warn("[ClinicOS] DB unavailable — queueing for retry");
    throw new Error("DB unavailable");
  }
}

function buildPacket(input: {
  name: string;
  email: string;
  service: string;
  phone?: string;
  channel?: string;
}): ClinicOSLeadPacket {
  const name = sanitizeInput(input.name);
  const email = sanitizeInput(input.email).toLowerCase();
  const service = sanitizeInput(input.service);
  return {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date().toISOString(),
    capture_channel: "Web_Premium_Front_Door",
    formData: { name, email, service, phone: input.phone, channel: input.channel },
    triage_priority: computeTriagePriority(service),
    device_telemetry: collectTelemetry(),
  };
}

export function useClinicOSSubmit() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const onlineRef = useRef(isBrowser ? navigator.onLine : true);
  const queryClient = useQueryClient();

  const flushQueue = useCallback(async () => {
    const pending = getPending();
    if (pending.length === 0) return;

    const remaining: ClinicOSLeadPacket[] = [];
    for (const entry of pending) {
      try {
        setStatus("submitting");
        console.log("[ClinicOS] Flushing cached:", JSON.stringify(entry, null, 2));
        await transmitPacket(entry);
      } catch {
        remaining.push(entry);
      }
    }
    if (remaining.length === 0) {
      clearPending();
      queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    }
  }, [queryClient]);

  useEffect(() => {
    const handleOnline = () => {
      onlineRef.current = true;
      if (getPending().length > 0) {
        toast.info("Connection restored — submitting pending inquiries...");
        flushQueue().then(() => {
          if (getPending().length === 0) {
            toast.success("All pending submissions sent successfully");
          }
        });
      }
    };
    const handleOffline = () => {
      onlineRef.current = false;
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [flushQueue]);

  const submit = useCallback(
    async (input: {
      name: string;
      email: string;
      service: string;
      phone?: string;
      channel?: string;
    }): Promise<SubmitStatus> => {
      setStatus("submitting");
      const packet = buildPacket(input);

      if (!isBrowser || !navigator.onLine) {
        addPending(packet);
        setStatus("success");
        toast.success("Inquiry saved offline", {
          description: "We'll send it automatically when your connection returns.",
        });
        console.log("[ClinicOS] Cached offline:", JSON.stringify(packet, null, 2));
        return "success";
      }

      try {
        console.log("[ClinicOS] Outbound via server fn:", JSON.stringify(packet, null, 2));
        const result = await submitLead({
          data: {
            name: packet.formData.name,
            phone: packet.formData.phone || "",
            email: packet.formData.email,
            service: packet.formData.service,
            channel: packet.formData.channel || "",
            priority: packet.triage_priority,
            raw_payload: packet,
          },
        });

        if (result.status === "db_unavailable") {
          addPending(packet);
          setStatus("success");
          toast.success("Inquiry queued for delivery", {
            description: "Our system will retry automatically.",
          });
          console.log("[ClinicOS] DB unavailable — queued for retry");
          return "success";
        }

        setStatus("success");
        queryClient.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
        return "success";
      } catch {
        addPending(packet);
        setStatus("success");
        toast.success("Inquiry queued for delivery", {
          description: "Our system will retry automatically.",
        });
        console.log(
          "[ClinicOS] Server fn failed — cached for retry:",
          JSON.stringify(packet, null, 2),
        );
        return "success";
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
  }, []);

  return { submit, status, reset, flushQueue };
}
