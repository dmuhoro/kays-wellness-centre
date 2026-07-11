import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUnsafe = vi.fn();
const mockGetDb = vi.fn(() => ({ unsafe: mockUnsafe }));

vi.mock("@/lib/db.server", () => ({
  getDb: () => mockGetDb(),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    SSE_EVENT_PUBLISHED: "SSE_EVENT_PUBLISHED",
    SCHEMA_SETUP: "SCHEMA_SETUP",
  },
}));

describe("event-bus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsafe.mockReset();
  });

  it("publishEvent inserts into live_events", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { publishEvent } = await import("@/lib/event-bus.server");
    await publishEvent("org-1", "lead:updated", { leadId: 42, status: "converted" });
    expect(mockUnsafe).toHaveBeenCalledTimes(1);
    const sql = mockUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("INSERT INTO live_events");
    expect(mockUnsafe.mock.calls[0][1][0]).toBe("org-1");
    expect(mockUnsafe.mock.calls[0][1][1]).toBe("lead:updated");
  });

  it("publishEvent silently handles DB errors", async () => {
    mockUnsafe.mockRejectedValue(new Error("DB down"));
    const { publishEvent } = await import("@/lib/event-bus.server");
    await expect(publishEvent("org-1", "test", {})).resolves.toBeUndefined();
  });

  it("pollLiveEvents queries events after given ID", async () => {
    mockUnsafe.mockResolvedValue([
      { id: 5, tenant_id: "org-1", event_type: "lead:updated", payload: {}, created_at: "2026-07-11T00:00:00Z" },
    ]);
    const { pollLiveEvents } = await import("@/lib/event-bus.server");
    const events = await pollLiveEvents("org-1", 3);
    expect(events).toHaveLength(1);
    expect(mockUnsafe.mock.calls[0][1][0]).toBe("org-1");
    expect(mockUnsafe.mock.calls[0][1][1]).toBe(3);
  });

  it("pollLiveEvents filters by org and afterId", async () => {
    mockUnsafe.mockResolvedValue([
      { id: 10, tenant_id: "org-2", event_type: "lead:created", payload: {}, created_at: "2026-07-11T00:00:00Z" },
    ]);
    const { pollLiveEvents } = await import("@/lib/event-bus.server");
    const events = await pollLiveEvents("org-2", 5);
    expect(events).toHaveLength(1);
    expect(mockUnsafe.mock.calls[0][1][0]).toBe("org-2");
    expect(mockUnsafe.mock.calls[0][1][1]).toBe(5);
    expect(mockUnsafe.mock.calls[0][1][2]).toBe(50);
  });

  it("ensureLiveEventsSchema creates table", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { ensureLiveEventsSchema } = await import("@/lib/event-bus.server");
    const result = await ensureLiveEventsSchema();
    expect(result).toBe(true);
    const sql = mockUnsafe.mock.calls[0][0] as string;
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS live_events");
  });

  it("cleanLiveEvents deletes old events", async () => {
    mockUnsafe.mockResolvedValue([]);
    const { cleanLiveEvents } = await import("@/lib/event-bus.server");
    await cleanLiveEvents("org-1");
    expect(mockUnsafe.mock.calls[0][1][0]).toBe("org-1");
  });
});
