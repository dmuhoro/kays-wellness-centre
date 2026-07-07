import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";

type SubmissionPayload = {
  Client_Lead_Source: "Online_Front_Door";
  Payload_Timestamp: string;
  formData: Record<string, string>;
  userMetrics: {
    userAgent: string;
    language: string;
    referrer: string;
    timezone: string;
    screenResolution: string;
    connectionType: string;
  };
};

type SubmitStatus = "idle" | "submitting" | "success" | "error";

const STORAGE_KEY = "kwc_pending_submissions";

function getPendingSubmissions(): Record<string, string>[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function addPendingSubmission(data: Record<string, string>) {
  const pending = getPendingSubmissions();
  pending.push({ ...data, _cachedAt: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

function clearPendingSubmissions() {
  localStorage.removeItem(STORAGE_KEY);
}

function buildPayload(formData: Record<string, string>): SubmissionPayload {
  return {
    Client_Lead_Source: "Online_Front_Door",
    Payload_Timestamp: new Date().toISOString(),
    formData,
    userMetrics: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      referrer: document.referrer || "direct",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      connectionType: (navigator as any).connection?.effectiveType || "unknown",
    },
  };
}

function simulateSuccess(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1200));
}

export function useClinicOSSubmit() {
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const onlineRef = useRef(navigator.onLine);

  const flushQueue = useCallback(async () => {
    const pending = getPendingSubmissions();
    if (pending.length === 0) return;

    for (const entry of pending) {
      try {
        setStatus("submitting");
        // eslint-disable-next-line no-console
        console.log(
          "[ClinicOS] Flushing cached submission:",
          JSON.stringify(buildPayload(entry), null, 2),
        );
        await simulateSuccess();
      } catch {
        return;
      }
    }
    clearPendingSubmissions();
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      onlineRef.current = true;
      const pending = getPendingSubmissions();
      if (pending.length > 0) {
        toast.info("Connection restored — submitting pending inquiries...");
        flushQueue().then(() => {
          if (getPendingSubmissions().length === 0) {
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

  const submit = useCallback(async (formData: Record<string, string>): Promise<SubmitStatus> => {
    setStatus("submitting");

    const payload = buildPayload(formData);

    if (!navigator.onLine) {
      addPendingSubmission(formData);
      setStatus("success");
      toast.success("Inquiry saved offline", {
        description: "We'll send it automatically when your connection returns.",
      });
      // eslint-disable-next-line no-console
      console.log("[ClinicOS] Offline — submission cached:", JSON.stringify(payload, null, 2));
      return "success";
    }

    try {
      // eslint-disable-next-line no-console
      console.log("[ClinicOS] Submission payload:", JSON.stringify(payload, null, 2));

      await simulateSuccess();

      setStatus("success");
      toast.success("Inquiry received", {
        description:
          "Our medical team will respond within 24 hours. A confirmation has been sent to your email.",
      });
      return "success";
    } catch (err) {
      setStatus("error");
      toast.error("Something went wrong", {
        description: "Your inquiry has been saved locally. We'll retry sending when possible.",
      });
      addPendingSubmission(formData);
      return "error";
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
  }, []);

  return { submit, status, reset, flushQueue };
}
