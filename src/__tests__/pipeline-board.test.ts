import { describe, it, expect, vi } from "vitest";

vi.setConfig({ testTimeout: 60_000 });

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/api/interactions.server", () => ({
  getLeadsWithPendingReplies: vi.fn().mockResolvedValue([]),
  getLeadInteractions: vi.fn().mockResolvedValue([]),
  logInteraction: vi.fn().mockResolvedValue({ status: "recorded" }),
}));

vi.mock("@/lib/api/dispatch.server", () => ({
  dispatchLeadMessage: vi.fn().mockResolvedValue({ status: "dispatched" }),
}));

vi.mock("@/lib/api/billing.server", () => ({
  generateInvoiceForCheckedIn: vi.fn().mockResolvedValue({ status: "ok" }),
}));

describe("PipelineBoard", () => {
  it("exports PipelineBoard as function component", async () => {
    const mod = await import("@/components/leads/PipelineBoard");
    expect(mod).toHaveProperty("PipelineBoard");
    expect(typeof mod.PipelineBoard).toBe("function");
  }, 60_000);

  it("exports PIPELINE_STAGES with all five stages", async () => {
    const mod = await import("@/components/leads/PipelineBoard");
    expect(mod.PIPELINE_STAGES).toHaveLength(5);
    const keys = mod.PIPELINE_STAGES.map((s: { key: string }) => s.key);
    expect(keys).toContain("pending");
    expect(keys).toContain("contacted");
    expect(keys).toContain("scheduled");
    expect(keys).toContain("converted");
    expect(keys).toContain("closed");
  });
});
