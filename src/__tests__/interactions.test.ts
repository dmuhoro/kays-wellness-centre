import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
};

vi.mock("../lib/logger.server", () => ({
  logger: mockLogger,
  EVENTS: {
    INTERACTION_RECORDED: "INTERACTION_RECORDED",
    LEAD_FLAGGED: "LEAD_FLAGGED",
    WHATSAPP_INBOUND: "WHATSAPP_INBOUND",
  },
}));

vi.mock("../lib/db.server", () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/api/resources.server", () => ({
  fetchResources: vi.fn().mockResolvedValue({ status: "ok", resources: [] }),
  scheduleAppointment: vi.fn().mockResolvedValue({ status: "ok" }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({ data: null, isLoading: false }),
  useSuspenseQuery: () => ({ data: null }),
}));

vi.mock("../lib/session.server", () => ({
  getCurrentOrgId: () => "org-test-1",
}));

vi.mock("../lib/tenant.server", () => ({
  requireOrg: () => ({
    orgId: "org-test-1",
    requestId: "req-1",
    log: mockLogger,
  }),
}));

describe("lead interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("containsPessimisticKeyword detects cancellation words", async () => {
    const { containsPessimisticKeyword } = await import("../lib/api/interactions.server");
    expect(containsPessimisticKeyword("I want to cancel my appointment")).toBe(true);
    expect(containsPessimisticKeyword("I can't make it tomorrow")).toBe(true);
    expect(containsPessimisticKeyword("Please reschedule")).toBe(true);
    expect(containsPessimisticKeyword("Thank you for the reminder")).toBe(false);
    expect(containsPessimisticKeyword("Looking forward to my visit")).toBe(false);
  });

  it("exports server functions", async () => {
    const mod = await import("../lib/api/interactions.server");
    expect(mod).toHaveProperty("logInteraction");
    expect(mod).toHaveProperty("getLeadInteractions");
    expect(mod).toHaveProperty("getLeadsWithPendingReplies");
    expect(typeof mod.logInteraction).toBe("function");
  });
});

describe("calendar scheduling", () => {
  it("exports CalendarGrid as function component", async () => {
    const mod = await import("@/components/leads/CalendarGrid");
    expect(mod).toHaveProperty("CalendarGrid");
    expect(typeof mod.CalendarGrid).toBe("function");
  });
});

describe("activity timeline", () => {
  it("exports ActivityTimeline as function component", async () => {
    const mod = await import("@/components/leads/ActivityTimeline");
    expect(mod).toHaveProperty("ActivityTimeline");
    expect(typeof mod.ActivityTimeline).toBe("function");
  });
});
