import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
  isDbAvailable: vi.fn(() => true),
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
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: { AUTOMATION_FOLLOWUP: "AUTOMATION_FOLLOWUP" },
}));

import {
  computeRetentionScore,
  getCareHistory,
  getRetentionScores,
  scheduleRetentionTask,
  getPendingRetentionTasks,
  markRetentionTaskSent,
  markRetentionTaskFailed,
  findEmptySlotCandidates,
  generateRetentionCampaign,
  getRetentionStats,
} from "@/lib/marketing/automation.server";
import { isDbAvailable } from "@/lib/db.server";

function makeHistory(overrides: Partial<import("@/lib/marketing/automation.server").CareHistoryEntry> = {}) {
  return {
    leadId: 1,
    leadName: "Jane",
    phone: "+254700000001",
    lastServiceDate: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    lastServiceType: "consultation",
    totalVisits: 10,
    totalRevenue: 15000,
    daysSinceLastVisit: 10,
    ...overrides,
  };
}

describe("computeRetentionScore", () => {
  it("returns champion segment for high visits, recent visit, high revenue", () => {
    const score = computeRetentionScore(makeHistory({
      totalVisits: 15,
      daysSinceLastVisit: 5,
      totalRevenue: 25000,
    }));
    expect(score.segment).toBe("champion");
    expect(score.overallScore).toBeGreaterThanOrEqual(60);
  });

  it("returns healthy segment for moderate values", () => {
    const score = computeRetentionScore(makeHistory({
      totalVisits: 8,
      daysSinceLastVisit: 50,
      totalRevenue: 10000,
    }));
    expect(score.segment).toBe("healthy");
    expect(score.overallScore).toBeGreaterThanOrEqual(40);
    expect(score.overallScore).toBeLessThan(60);
  });

  it("returns needs_attention segment for lower values", () => {
    const score = computeRetentionScore(makeHistory({
      totalVisits: 5,
      daysSinceLastVisit: 150,
      totalRevenue: 5000,
    }));
    expect(score.segment).toBe("needs_attention");
    expect(score.overallScore).toBeGreaterThanOrEqual(20);
    expect(score.overallScore).toBeLessThan(40);
  });

  it("returns at_risk segment for very low values", () => {
    const score = computeRetentionScore(makeHistory({
      totalVisits: 0,
      daysSinceLastVisit: 400,
      totalRevenue: 0,
    }));
    expect(score.segment).toBe("at_risk");
    expect(score.overallScore).toBeLessThan(20);
  });

  it("caps visit frequency at 20", () => {
    const score = computeRetentionScore(makeHistory({ totalVisits: 100 }));
    expect(score.visitFrequency).toBe(20);
  });

  it("calculates visit frequency as visits * 2", () => {
    const score = computeRetentionScore(makeHistory({ totalVisits: 5 }));
    expect(score.visitFrequency).toBe(10);
  });

  it("recency score for <= 30 days is 30", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: 30 }));
    expect(score.recencyScore).toBe(30);
  });

  it("recency score for <= 90 days is 20", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: 90 }));
    expect(score.recencyScore).toBe(20);
  });

  it("recency score for <= 180 days is 10", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: 180 }));
    expect(score.recencyScore).toBe(10);
  });

  it("recency score for <= 365 days is 5", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: 365 }));
    expect(score.recencyScore).toBe(5);
  });

  it("recency score for > 365 days is 0", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: 400 }));
    expect(score.recencyScore).toBe(0);
  });

  it("defaults daysSinceLastVisit to 999 when null", () => {
    const score = computeRetentionScore(makeHistory({ daysSinceLastVisit: null }));
    expect(score.recencyScore).toBe(0);
  });

  it("zero revenue gives monetary value of 0", () => {
    const score = computeRetentionScore(makeHistory({ totalRevenue: 0 }));
    expect(score.monetaryValue).toBe(0);
  });

  it("monetary value is capped at 30", () => {
    const score = computeRetentionScore(makeHistory({ totalRevenue: 500000 }));
    expect(score.monetaryValue).toBe(30);
  });

  it("overallScore is sum of components", () => {
    const score = computeRetentionScore(makeHistory({
      totalVisits: 5,
      daysSinceLastVisit: 10,
      totalRevenue: 5000,
    }));
    const expected = 10 + 30 + 5;
    expect(score.overallScore).toBe(expected);
  });

  it("returns correct leadId", () => {
    const score = computeRetentionScore(makeHistory({ leadId: 42 }));
    expect(score.leadId).toBe(42);
  });
});

describe("getCareHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when DB unavailable", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const result = await getCareHistory("org-1");
    expect(result).toEqual([]);
  });

  it("returns care history entries", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const now = new Date().toISOString();
    mockDb.unsafe.mockResolvedValueOnce([
      {
        lead_id: 1,
        lead_name: "Jane",
        phone: "+254700000001",
        last_service_date: now,
        last_service_type: "consultation",
        total_visits: "5",
        total_revenue: "10000",
      },
    ]);

    const result = await getCareHistory("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].leadId).toBe(1);
    expect(result[0].totalVisits).toBe(5);
    expect(result[0].totalRevenue).toBe(10000);
  });
});

describe("getRetentionScores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when DB unavailable", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const result = await getRetentionScores("org-1");
    expect(result).toEqual([]);
  });

  it("returns scores derived from care history", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockDb.unsafe.mockResolvedValueOnce([
      {
        lead_id: 1,
        lead_name: "Jane",
        phone: "+254700000001",
        last_service_date: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        last_service_type: "consultation",
        total_visits: "8",
        total_revenue: "12000",
      },
    ]);

    const result = await getRetentionScores("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].overallScore).toBeGreaterThanOrEqual(0);
    expect(["champion", "healthy", "needs_attention", "at_risk"]).toContain(result[0].segment);
  });
});

describe("scheduleRetentionTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when lead not found", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await expect(
      scheduleRetentionTask("org-1", 1, "follow_up_checkup"),
    ).rejects.toThrow("Lead not found");
  });

  it("schedules task with correct action type", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "Jane", phone: "+254700000001" }])
      .mockResolvedValueOnce([{
        id: 10,
        status: "pending",
        created_at: new Date().toISOString(),
      }]);

    const task = await scheduleRetentionTask("org-1", 1, "preventative_care_reminder");
    expect(task.actionType).toBe("preventative_care_reminder");
    expect(task.status).toBe("pending");
    expect(task.leadId).toBe(1);
  });

  it("uses custom message when provided", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "Jane", phone: "+254700000001" }])
      .mockResolvedValueOnce([{
        id: 11,
        status: "pending",
        created_at: new Date().toISOString(),
      }]);

    const customMsg = "Custom message for {{name}}";
    const task = await scheduleRetentionTask("org-1", 1, "vaccination_due", "sms", customMsg);
    expect(task.message).toBe("Custom message for Jane");
  });

  it("uses default channel whatsapp", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "Bob", phone: "+254700000002" }])
      .mockResolvedValueOnce([{
        id: 12,
        status: "pending",
        created_at: new Date().toISOString(),
      }]);

    const task = await scheduleRetentionTask("org-1", 2, "wellness_screening");
    expect(task.channel).toBe("whatsapp");
  });
});

describe("getPendingRetentionTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when DB unavailable", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const result = await getPendingRetentionTasks("org-1");
    expect(result).toEqual([]);
  });

  it("returns pending tasks when DB available", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, orgId: "org-1", leadId: 1, actionType: "follow_up_checkup", status: "pending" },
    ]);

    const result = await getPendingRetentionTasks("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("pending");
  });
});

describe("markRetentionTaskSent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates task status to sent", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await markRetentionTaskSent(1, "org-1");
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE retention_tasks SET status = 'sent'"),
      [1, "org-1"],
    );
  });
});

describe("markRetentionTaskFailed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates task status with error", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await markRetentionTaskFailed(1, "org-1", "timeout");
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE retention_tasks SET status = 'failed'"),
      [1, "org-1", JSON.stringify({ error: "timeout" })],
    );
  });
});

describe("findEmptySlotCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when DB unavailable", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const result = await findEmptySlotCandidates("org-1");
    expect(result).toEqual([]);
  });

  it("returns candidates with phone numbers", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const now = new Date(Date.now() - 30 * 86_400_000).toISOString();
    mockDb.unsafe.mockResolvedValueOnce([
      {
        lead_id: 1,
        lead_name: "Jane",
        phone: "+254700000001",
        last_service_date: now,
        last_service_type: "consultation",
        total_visits: "5",
        total_revenue: "8000",
      },
    ]);

    const result = await findEmptySlotCandidates("org-1");
    expect(result).toHaveLength(1);
    expect(result[0].phone).toBeTruthy();
    expect(result[0].leadId).toBe(1);
  });

  it("excludes leads without phone numbers", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const now = new Date(Date.now() - 30 * 86_400_000).toISOString();
    mockDb.unsafe.mockResolvedValueOnce([
      {
        lead_id: 1,
        lead_name: "Jane",
        phone: null,
        last_service_date: now,
        last_service_type: "consultation",
        total_visits: "5",
        total_revenue: "8000",
      },
    ]);

    const result = await findEmptySlotCandidates("org-1");
    expect(result).toHaveLength(0);
  });
});

describe("generateRetentionCampaign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns campaign with correct action type", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ eligible: "5" }]);
    const campaign = await generateRetentionCampaign("org-1", "medication_review");
    expect(campaign.actionType).toBe("medication_review");
    expect(campaign.orgId).toBe("org-1");
    expect(campaign.targetCount).toBe(5);
  });

  it("returns message template for the action type", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ eligible: "3" }]);
    const campaign = await generateRetentionCampaign("org-1", "empty_slot_fill");
    expect(campaign.messageTemplate).toContain("slot");
  });
});

describe("getRetentionStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zeros when DB unavailable", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const stats = await getRetentionStats("org-1");
    expect(stats).toEqual({
      totalTasks: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      atRiskCount: 0,
      championCount: 0,
    });
  });

  it("returns correct structure when DB available", async () => {
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValue(true);
    mockDb.unsafe
      .mockResolvedValueOnce([{ total: "10", pending: "3", sent: "5", failed: "2" }])
      .mockResolvedValueOnce([
        {
          lead_id: 1,
          lead_name: "A",
          phone: "+254700000001",
          last_service_date: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          last_service_type: "consultation",
          total_visits: "15",
          total_revenue: "30000",
        },
        {
          lead_id: 2,
          lead_name: "B",
          phone: "+254700000002",
          last_service_date: new Date(Date.now() - 400 * 86_400_000).toISOString(),
          last_service_type: "checkup",
          total_visits: "1",
          total_revenue: "500",
        },
      ]);

    const stats = await getRetentionStats("org-1");
    expect(stats.totalTasks).toBe(10);
    expect(stats.pending).toBe(3);
    expect(stats.sent).toBe(5);
    expect(stats.failed).toBe(2);
    expect(stats.atRiskCount).toBeGreaterThanOrEqual(0);
    expect(stats.championCount).toBeGreaterThanOrEqual(0);
  });
});

describe("RetentionAction types", () => {
  it("all 6 action types are valid strings", () => {
    const actions: import("@/lib/marketing/automation.server").RetentionAction[] = [
      "preventative_care_reminder",
      "follow_up_checkup",
      "vaccination_due",
      "wellness_screening",
      "medication_review",
      "empty_slot_fill",
    ];
    expect(actions).toHaveLength(6);
    actions.forEach((a) => expect(typeof a).toBe("string"));
  });
});

describe("EngagementChannel types", () => {
  it("supports whatsapp, sms, email", () => {
    const channels: import("@/lib/marketing/automation.server").EngagementChannel[] = [
      "whatsapp",
      "sms",
      "email",
    ];
    expect(channels).toHaveLength(3);
    expect(channels).toContain("whatsapp");
    expect(channels).toContain("sms");
    expect(channels).toContain("email");
  });
});

describe("RetentionScore segment logic", () => {
  it("segment boundaries are correct", () => {
    expect(computeRetentionScore(makeHistory({ totalVisits: 0, daysSinceLastVisit: 400, totalRevenue: 0 })).segment).toBe("at_risk");
    expect(computeRetentionScore(makeHistory({ totalVisits: 5, daysSinceLastVisit: 100, totalRevenue: 5000 })).segment).toBe("needs_attention");
    expect(computeRetentionScore(makeHistory({ totalVisits: 8, daysSinceLastVisit: 50, totalRevenue: 10000 })).segment).toBe("healthy");
    expect(computeRetentionScore(makeHistory({ totalVisits: 10, daysSinceLastVisit: 5, totalRevenue: 20000 })).segment).toBe("champion");
  });
});

describe("CareHistoryEntry interface", () => {
  it("has required fields", () => {
    const entry = makeHistory();
    expect(entry).toHaveProperty("leadId");
    expect(entry).toHaveProperty("leadName");
    expect(entry).toHaveProperty("phone");
    expect(entry).toHaveProperty("lastServiceDate");
    expect(entry).toHaveProperty("lastServiceType");
    expect(entry).toHaveProperty("totalVisits");
    expect(entry).toHaveProperty("totalRevenue");
    expect(entry).toHaveProperty("daysSinceLastVisit");
  });
});
