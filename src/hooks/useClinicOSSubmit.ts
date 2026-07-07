import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { ClinicOSLeadPacket, SubmitStatus } from "./clinic-os-types";
import { computeTriagePriority, sanitizeInput, collectTelemetry } from "./clinic-os-types";

const STORAGE_KEY = "kwc_pending_submissions";
const isBrowser = typeof window !== "undefined" && typeof localStorage !== "undefined";

function getPending(): ClinicOSLeadPacket[] {
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

function simulateSuccess(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1200));
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

  const flushQueue = useCallback(async () => {
    const pending = getPending();
    if (pending.length === 0) return;

    for (const entry of pending) {
      try {
        setStatus("submitting");
        console.log("[ClinicOS] Flushing cached:", JSON.stringify(entry, null, 2));
        await simulateSuccess();
      } catch {
        return;
      }
    }
    clearPending();
  }, []);

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
        console.log("[ClinicOS] Outbound:", JSON.stringify(packet, null, 2));
        await simulateSuccess();
        setStatus("success");
        return "success";
      } catch {
        setStatus("error");
        toast.error("Something went wrong", {
          description: "Saved locally. We'll retry when possible.",
        });
        addPending(packet);
        return "error";
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setStatus("idle");
  }, []);

  return { submit, status, reset, flushQueue };
}
