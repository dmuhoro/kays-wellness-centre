import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: { LEAD_CREATED: "LEAD_CREATED", AUTOMATION_STAGE_CHANGE: "AUTOMATION_STAGE_CHANGE" },
}));
vi.mock("@/lib/session.server", () => ({
  getSession: vi.fn(() => ({ userId: 1 })),
}));
vi.mock("@/lib/audit.server", () => ({
  recordAudit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/event-bus.server", () => ({
  publishEvent: vi.fn(() => Promise.resolve()),
}));

import {
  classifyLeadSource,
  STAGE_ORDER,
  STAGE_LABELS,
  getPipelineBoard,
  getLeadSourceStats,
  getLeadActivities,
  searchLeads,
} from "@/lib/marketing/leads.server";
import { isDbAvailable } from "@/lib/db.server";

describe("classifyLeadSource", () => {
  it("classifies whatsapp source", () => {
    expect(classifyLeadSource("whatsapp")).toBe("whatsapp");
  });

  it("classifies web_form source", () => {
    expect(classifyLeadSource("web_form")).toBe("web_form");
  });

  it("classifies landing_page source", () => {
    expect(classifyLeadSource("landing_page")).toBe("landing_page");
  });

  it("classifies referral source", () => {
    expect(classifyLeadSource("referral")).toBe("referral");
  });

  it("classifies walk_in source via keyword match", () => {
    expect(classifyLeadSource("in-person")).toBe("walk_in");
  });

  it("classifies unknown source", () => {
    expect(classifyLeadSource("unknown")).toBe("unknown");
  });

  it("classifies case-insensitively", () => {
    expect(classifyLeadSource("WHATSAPP")).toBe("whatsapp");
    expect(classifyLeadSource("Web_Form")).toBe("web_form");
    expect(classifyLeadSource("REFERRAL")).toBe("referral");
  });

  it("returns unknown for empty string", () => {
    expect(classifyLeadSource("")).toBe("unknown");
  });
});

describe("STAGE_ORDER / STAGE_LABELS constants", () => {
  it("STAGE_ORDER has 6 entries", () => {
    expect(STAGE_ORDER).toHaveLength(6);
  });

  it("STAGE_LABELS has 6 entries", () => {
    expect(Object.keys(STAGE_LABELS)).toHaveLength(6);
  });

  it("first stage is new", () => {
    expect(STAGE_ORDER[0]).toBe("new");
  });

  it("last stage is lost", () => {
    expect(STAGE_ORDER[5]).toBe("lost");
  });

  it("stage labels match stages correctly", () => {
    expect(STAGE_LABELS.new).toBe("New Leads");
    expect(STAGE_LABELS.contacted).toBe("Contacted");
    expect(STAGE_LABELS.scheduled).toBe("Scheduled");
    expect(STAGE_LABELS.checked_in).toBe("Checked In");
    expect(STAGE_LABELS.converted).toBe("Converted");
    expect(STAGE_LABELS.lost).toBe("Lost");
  });
});

describe("Pipeline stage flow", () => {
  it("stage order includes all expected stages", () => {
    expect(STAGE_ORDER).toEqual(["new", "contacted", "scheduled", "checked_in", "converted", "lost"]);
  });

  it("STAGE_LABELS keys match STAGE_ORDER", () => {
    const labelKeys = Object.keys(STAGE_LABELS);
    expect(labelKeys).toEqual(STAGE_ORDER);
  });
});

describe("getPipelineBoard", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("returns empty board when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const board = await getPipelineBoard("org-1");
    expect(board.totalLeads).toBe(0);
    expect(board.conversionRate).toBe(0);
    expect(board.columns).toHaveLength(6);
    expect(board.orgId).toBe("org-1");
    vi.mocked(isDbAvailable).mockReturnValue(true);
  });

  it("returns board with 6 columns", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    expect(board.columns).toHaveLength(6);
  });

  it("returns correct stage labels on columns", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    expect(board.columns[0].label).toBe("New Leads");
    expect(board.columns[1].label).toBe("Contacted");
    expect(board.columns[2].label).toBe("Scheduled");
    expect(board.columns[3].label).toBe("Checked In");
    expect(board.columns[4].label).toBe("Converted");
    expect(board.columns[5].label).toBe("Lost");
  });

  it("pipeline stages include all 6 stages", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    const stages = board.columns.map((c) => c.stage);
    expect(stages).toEqual(["new", "contacted", "scheduled", "checked_in", "converted", "lost"]);
  });

  it("returns correct orgId", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-test-42");
    expect(board.orgId).toBe("org-test-42");
  });

  it("distributes leads into correct columns", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "whatsapp", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: 2, name: "B", phone: "", email: "", service: "", channel: "web_form", priority: "low", status: "contacted", created_at: "2026-01-02", updated_at: "2026-01-02" },
        { id: 3, name: "C", phone: "", email: "", service: "", channel: "referral", priority: "high", status: "converted", created_at: "2026-01-03", updated_at: "2026-01-03" },
      ])
      .mockResolvedValueOnce([{ avg_val: 5000 }]);
    const board = await getPipelineBoard("org-1");
    expect(board.totalLeads).toBe(3);
    expect(board.columns[0].count).toBe(1);
    expect(board.columns[0].leads).toHaveLength(1);
    expect(board.columns[1].count).toBe(1);
    expect(board.columns[4].count).toBe(1);
  });

  it("calculates conversion rate", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "converted", created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: 2, name: "B", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: 3, name: "C", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "converted", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    expect(board.conversionRate).toBe(66.67);
  });

  it("uses default estimated value when no invoices exist", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    expect(board.columns[0].totalEstimatedValue).toBe(2500);
  });

  it("uses average invoice value when available", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ])
      .mockResolvedValueOnce([{ avg_val: 4000 }]);
    const board = await getPipelineBoard("org-1");
    expect(board.columns[0].totalEstimatedValue).toBe(4000);
  });
});

describe("getLeadSourceStats", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("returns empty array when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const stats = await getLeadSourceStats("org-1");
    expect(stats).toEqual([]);
    vi.mocked(isDbAvailable).mockReturnValue(true);
  });

  it("returns stats from DB when available", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { channel: "whatsapp", count: "10" },
      { channel: "web_form", count: "5" },
    ]);
    const stats = await getLeadSourceStats("org-1");
    expect(stats).toHaveLength(2);
    expect(stats[0].count).toBe(10);
    expect(stats[0].source).toBe("whatsapp");
    expect(stats[0].percentage).toBe(66.67);
    expect(stats[1].count).toBe(5);
    expect(stats[1].percentage).toBe(33.33);
  });
});

describe("getLeadActivities", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("returns empty array when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const activities = await getLeadActivities("org-1", 1);
    expect(activities).toEqual([]);
    vi.mocked(isDbAvailable).mockReturnValue(true);
  });

  it("returns activities from DB", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, leadId: 10, eventType: "new", metadata: {}, createdAt: "2026-01-01" },
      { id: 2, leadId: 10, eventType: "contacted", metadata: {}, createdAt: "2026-01-02" },
    ]);
    const activities = await getLeadActivities("org-1", 10);
    expect(activities).toHaveLength(2);
  });
});

describe("searchLeads", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("returns empty array when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const results = await searchLeads("org-1", "alice");
    expect(results).toEqual([]);
    vi.mocked(isDbAvailable).mockReturnValue(true);
  });

  it("returns matching leads from DB", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, name: "Alice", phone: "123", email: "a@b.com", service: "massage", channel: "whatsapp", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
    ]);
    const results = await searchLeads("org-1", "alice");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Alice");
    expect(results[0].source).toBe("whatsapp");
  });
});

describe("InboundLeadPayload type validation", () => {
  it("LeadSource accepts all valid source values", () => {
    const validSources = ["whatsapp", "web_form", "landing_page", "referral", "walk_in", "unknown"];
    for (const source of validSources) {
      expect(classifyLeadSource(source === "unknown" ? "xyz_no_match" : source)).toBeTruthy();
    }
  });

  it("classifies keyword variants to correct sources", () => {
    expect(classifyLeadSource("wa")).toBe("whatsapp");
    expect(classifyLeadSource("website")).toBe("web_form");
    expect(classifyLeadSource("facebook")).toBe("landing_page");
    expect(classifyLeadSource("friend")).toBe("referral");
    expect(classifyLeadSource("in-person")).toBe("walk_in");
  });
});

describe("PipelineBoard interface shape", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("empty board has orgId, columns, totalLeads, conversionRate", async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    const board = await getPipelineBoard("org-1");
    expect(board).toHaveProperty("orgId");
    expect(board).toHaveProperty("columns");
    expect(board).toHaveProperty("totalLeads");
    expect(board).toHaveProperty("conversionRate");
    vi.mocked(isDbAvailable).mockReturnValue(true);
  });

  it("board columns are array of PipelineColumn", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    for (const col of board.columns) {
      expect(col).toHaveProperty("stage");
      expect(col).toHaveProperty("label");
      expect(col).toHaveProperty("leads");
      expect(col).toHaveProperty("count");
      expect(col).toHaveProperty("totalEstimatedValue");
    }
  });
});

describe("PipelineColumn interface shape", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("column has correct types", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    const col = board.columns[0];
    expect(typeof col.stage).toBe("string");
    expect(typeof col.label).toBe("string");
    expect(Array.isArray(col.leads)).toBe(true);
    expect(typeof col.count).toBe("number");
    expect(typeof col.totalEstimatedValue).toBe("number");
  });

  it("each column count matches leads array length", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
        { id: 2, name: "B", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    for (const col of board.columns) {
      expect(col.count).toBe(col.leads.length);
    }
  });
});

describe("Default estimated value", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("uses 2500 default when avg_val is null", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([
        { id: 1, name: "A", phone: "", email: "", service: "", channel: "wa", priority: "medium", status: "new", created_at: "2026-01-01", updated_at: "2026-01-01" },
      ])
      .mockResolvedValueOnce([{ avg_val: null }]);
    const board = await getPipelineBoard("org-1");
    expect(board.columns[0].totalEstimatedValue).toBe(2500);
  });
});
