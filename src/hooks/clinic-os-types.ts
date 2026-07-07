export type TriagePriority = "low" | "medium" | "high";
export type CaptureChannel = "Web_Premium_Front_Door";
export type SubmitStatus = "idle" | "submitting" | "success" | "error";

export interface ClinicOSLeadPacket {
  Client_Lead_Source: "Online_Front_Door";
  Payload_Timestamp: string;
  capture_channel: CaptureChannel;
  formData: {
    name: string;
    email: string;
    service: string;
    phone?: string;
    channel?: string;
  };
  triage_priority: TriagePriority;
  device_telemetry: {
    connectionType: string;
    onlineStatus: boolean;
    localTimestamp: string;
    timezone: string;
    userAgent: string;
  };
}

export function computeTriagePriority(serviceId: string): TriagePriority {
  const high = new Set(["chronic-disease", "autoimmune"]);
  const medium = new Set(["bhrh", "iv-nutrition", "metabolic", "longevity"]);
  if (high.has(serviceId)) return "high";
  if (medium.has(serviceId)) return "medium";
  return "low";
}

export function sanitizeInput(value: string): string {
  const noTags = value.replace(/<[^>]*>/g, "");
  const noControl = noTags.replace(/\0/g, "").replace(/\x08/g, "").replace(/\x0B/g, "").replace(/\x1A/g, "");
  const noQuotes = noControl.replace(/[<>"'`]/g, "");
  return noQuotes.trim();
}

export function collectTelemetry() {
  return {
    connectionType:
      (navigator as Navigator & { connection?: { effectiveType: string } }).connection
        ?.effectiveType || "unknown",
    onlineStatus: navigator.onLine,
    localTimestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
  };
}
