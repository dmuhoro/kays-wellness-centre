import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Optimistic update infrastructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LEADS_QUERY_KEY is constant tuple", async () => {
    const mod = await import("@/hooks/useLeads");
    expect(mod.LEADS_QUERY_KEY).toEqual(["leads"]);
  });

  it("STORAGE_KEY constant is correct", async () => {
    const mod = await import("@/hooks/useClinicOSSubmit");
    const exported = (mod as unknown as Record<string, unknown>).STORAGE_KEY_EXPORTED;
    expect(exported).toBe("kwc_pending_submissions");
  });

  it("getOptimisticLeads returns empty array when no optimistic state exists", async () => {
    const { getOptimisticLeads } = await import("@/hooks/useClinicOSSubmit");
    expect(getOptimisticLeads()).toEqual([]);
  });

  it("computeTriagePriority returns expected values", async () => {
    const { computeTriagePriority } = await import("@/hooks/clinic-os-types");
    expect(computeTriagePriority("chronic-disease")).toBe("high");
    expect(computeTriagePriority("autoimmune")).toBe("high");
    expect(computeTriagePriority("bhrh")).toBe("medium");
    expect(computeTriagePriority("iv-nutrition")).toBe("medium");
    expect(computeTriagePriority("weight-management")).toBe("low");
    expect(computeTriagePriority("physio")).toBe("low");
  });

  it("sanitizeInput strips HTML tags and special characters", async () => {
    const { sanitizeInput } = await import("@/hooks/clinic-os-types");
    expect(sanitizeInput("<script>alert('xss')</script>")).toBe("alert(xss)");
    expect(sanitizeInput("  Hello & World  ")).toBe("Hello  World");
    expect(sanitizeInput("Normal Name")).toBe("Normal Name");
  });

  it("collectTelemetry returns expected shape when navigator is undefined", async () => {
    const { collectTelemetry } = await import("@/hooks/clinic-os-types");
    const telemetry = collectTelemetry();
    expect(telemetry).toHaveProperty("connectionType");
    expect(telemetry).toHaveProperty("onlineStatus");
    expect(telemetry).toHaveProperty("timezone");
    expect(telemetry).toHaveProperty("userAgent");
  });
});