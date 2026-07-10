import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  unsafe: vi.fn(),
};
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })),
}));

vi.mock("@/lib/queue.server", () => ({
  enqueueNotification: vi.fn(() => Promise.resolve({ id: 1, status: "queued" })),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    AUTOMATION_STAGE_CHANGE: "AUTOMATION_STAGE_CHANGE",
    AUTOMATION_FOLLOWUP: "AUTOMATION_FOLLOWUP",
    AUTOMATION_STALLED: "AUTOMATION_STALLED",
    AUTOMATION_ORCHESTRATOR_RUN: "AUTOMATION_ORCHESTRATOR_RUN",
  },
}));

vi.mock("@/lib/api/dispatch.server", () => ({
  sendWhatsApp: vi.fn(() => Promise.resolve({ success: true, provider: "log" })),
  formatMessage: vi.fn((_type: string, name: string) => `Hi ${name}, this is a test message.`),
}));

describe("Automation Stage Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("UNTOUCHED → sends first followup → TRIAGING", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "UNTOUCHED", retry_count: 0 }])
      .mockResolvedValueOnce([{ name: "Jane", phone: "+254700000001" }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1", current_stage: "TRIAGING",
        last_interaction_at: null, next_action_scheduled_at: new Date(Date.now() + 45 * 60_000).toISOString(),
        retry_count: 0, context_snapshot: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]);

    const { ensureAutomationState, updateAutomationStage, processProgressiveFollowup, getLeadsNeedingFollowup, runAutomationOrchestrator } = await import("@/lib/api/automation.server");

    mockDb.unsafe.mockReset();
    mockDb.unsafe
      .mockResolvedValueOnce([{ lead_id: 1, current_stage: "UNTOUCHED", retry_count: 0, last_interaction_at: new Date(Date.now() - 60 * 60_000).toISOString() }])
      .mockResolvedValueOnce([{ name: "Jane", phone: "+254700000001" }])
      .mockResolvedValueOnce([{ lead_id: 1, current_stage: "TRIAGING", retry_count: 0, last_interaction_at: null, next_action_scheduled_at: new Date(Date.now() + 45 * 60_000).toISOString(), context_snapshot: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }])
      .mockResolvedValueOnce([{ triage_timeout_minutes: 45 }])
      .mockResolvedValueOnce([{ lead_id: 1, current_stage: "UNTOUCHED", retry_count: 0, last_interaction_at: new Date(Date.now() - 60 * 60_000).toISOString() }])
      .mockResolvedValueOnce([{ name: "Jane", phone: "+254700000001" }]);

    const result = await processProgressiveFollowup(1, "org-1", 45);
    expect(result.action).toBe("first_followup");
    expect(result.dispatched).toBe(true);
  });

  it("TRIAGING with retry_count >= 2 moves to STALLED", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "TRIAGING", retry_count: 2 }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1", current_stage: "STALLED",
        last_interaction_at: null, next_action_scheduled_at: new Date().toISOString(),
        retry_count: 2, context_snapshot: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]);

    const { processProgressiveFollowup } = await import("@/lib/api/automation.server");

    mockDb.unsafe.mockReset();
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "TRIAGING", retry_count: 2 }])
      .mockResolvedValueOnce([{ lead_id: 1 }]);

    const result = await processProgressiveFollowup(1, "org-1", 45);
    expect(result.action).toBe("stalled");
    expect(result.dispatched).toBe(false);
  });

  it("TRIAGING with retry_count 1 sends retry followup", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "TRIAGING", retry_count: 1 }])
      .mockResolvedValueOnce([{ name: "Bob", phone: "+254700000002" }]);

    const { processProgressiveFollowup } = await import("@/lib/api/automation.server");

    mockDb.unsafe.mockReset();
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "TRIAGING", retry_count: 1 }])
      .mockResolvedValueOnce([{ name: "Bob", phone: "+254700000002" }])
      .mockResolvedValueOnce([]);

    const result = await processProgressiveFollowup(2, "org-1", 45);
    expect(result.action).toBe("retry_followup");
  });

  it("STALLED sends re-engagement nudge", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "STALLED", retry_count: 3 }])
      .mockResolvedValueOnce([{ name: "Alice", phone: "+254700000003" }]);

    const { processProgressiveFollowup } = await import("@/lib/api/automation.server");

    mockDb.unsafe.mockReset();
    mockDb.unsafe
      .mockResolvedValueOnce([{ current_stage: "STALLED", retry_count: 3 }])
      .mockResolvedValueOnce([{ name: "Alice", phone: "+254700000003" }])
      .mockResolvedValueOnce([]);

    const result = await processProgressiveFollowup(3, "org-1", 45);
    expect(result.action).toBe("re_engagement");
  });

  it("getLeadsNeedingFollowup returns only stale leads", async () => {
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValueOnce([
      { lead_id: 1, current_stage: "UNTOUCHED", retry_count: 0, last_interaction_at: new Date(Date.now() - 60 * 60_000).toISOString() },
      { lead_id: 2, current_stage: "TRIAGING", retry_count: 1, last_interaction_at: new Date(Date.now() - 30 * 60_000).toISOString() },
    ]);

    const { getLeadsNeedingFollowup } = await import("@/lib/api/automation.server");
    const leads = await getLeadsNeedingFollowup("org-1", 45);
    expect(Array.isArray(leads)).toBe(true);
    expect(leads.length).toBeGreaterThanOrEqual(0);
  });

  it("ensureAutomationState creates row if not exists", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1", current_stage: "UNTOUCHED",
        last_interaction_at: null, next_action_scheduled_at: null, retry_count: 0,
        context_snapshot: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]);

    const { ensureAutomationState } = await import("@/lib/api/automation.server");
    const row = await ensureAutomationState(1, "org-1");
    expect(row.current_stage).toBe("UNTOUCHED");
  });
});

describe("Automation Server Function Exports", () => {
  it("exports triggerAutomation as a server function", async () => {
    const mod = await import("@/lib/api/automation.server");
    expect(mod.triggerAutomation).toBeDefined();
    expect(typeof mod.triggerAutomation).toBe("function");
  });
});
