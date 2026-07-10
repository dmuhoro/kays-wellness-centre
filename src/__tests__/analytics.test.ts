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
    LEAD_FETCHED: "LEAD_FETCHED",
    DB_UNAVAILABLE: "DB_UNAVAILABLE",
    ANALYTICS_COMPUTED: "ANALYTICS_COMPUTED",
  },
}));

vi.mock("../lib/env.server", () => ({
  getEnv: () => ({ ANALYTICS_REVENUE_VALUE: 250 }),
}));

const mockUnsafe = vi.fn();
const mockGetDb = vi.fn().mockResolvedValue({ unsafe: mockUnsafe });

vi.mock("../lib/db.server", () => ({
  getDb: () => mockGetDb(),
  isDbAvailable: vi.fn().mockReturnValue(true),
}));

const mockGetCurrentOrgId = vi.fn().mockReturnValue("org-test-1");
vi.mock("../lib/session.server", () => ({
  getCurrentOrgId: () => mockGetCurrentOrgId(),
}));

vi.mock("../lib/tenant.server", () => ({
  requireOrg: () => ({
    orgId: "org-test-1",
    requestId: "req-1",
    log: mockLogger,
  }),
}));

describe("analytics computation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsafe.mockReset();
  });

  it("computeAnalytics returns snapshot structure", async () => {
    mockUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY status")) {
        return [
          { status: "pending", count: 5 },
          { status: "contacted", count: 3 },
          { status: "scheduled", count: 2 },
        ];
      }
      if (sql.includes("date_trunc('week'")) return [{ count: 4 }];
      if (sql.includes("date_trunc('month'")) return [{ count: 10 }];
      if (sql.includes("priority = 'high'")) return [{ count: 3 }];
      if (sql.includes("GROUP BY priority")) {
        return [
          { priority: "high", count: 3 },
          { priority: "medium", count: 5 },
          { priority: "low", count: 2 },
        ];
      }
      if (sql.includes("created_at >= ")) return [{ count: 10 }];
      return [];
    });

    const { computeAnalytics } = await import("../lib/analytics.server");
    const result = await computeAnalytics();

    expect(result).toHaveProperty("totalLeads", 10);
    expect(result).toHaveProperty("leadsThisWeek", 4);
    expect(result).toHaveProperty("leadsThisMonth", 10);
    expect(result).toHaveProperty("conversionVelocity");
    expect(result).toHaveProperty("triageToScheduleRate");
    expect(result).toHaveProperty("noShowPercentage");
    expect(result).toHaveProperty("revenueAtRisk");
    expect(result).toHaveProperty("stageBreakdown");
    expect(result).toHaveProperty("priorityBreakdown");
    expect(result).toHaveProperty("generatedAt");
  });

  it("computeAnalytics computes triageToScheduleRate correctly", async () => {
    mockUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY status")) {
        return [
          { status: "pending", count: 10 },
          { status: "contacted", count: 20 },
          { status: "scheduled", count: 10 },
        ];
      }
      if (sql.includes("date_trunc('week'")) return [{ count: 0 }];
      if (sql.includes("date_trunc('month'")) return [{ count: 0 }];
      if (sql.includes("priority = 'high'")) return [{ count: 0 }];
      if (sql.includes("GROUP BY priority")) return [];
      if (sql.includes("created_at >= ")) return [{ count: 0 }];
      return [];
    });

    const { computeAnalytics } = await import("../lib/analytics.server");
    const result = await computeAnalytics();

    expect(result.triageToScheduleRate).toBe(50);
  });

  it("computeAnalytics handles zero leads", async () => {
    mockUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("GROUP BY")) return [];
      if (sql.includes("date_trunc")) return [{ count: 0 }];
      if (sql.includes("priority = 'high'")) return [{ count: 0 }];
      if (sql.includes("created_at >= ")) return [{ count: 0 }];
      return [];
    });

    const { computeAnalytics } = await import("../lib/analytics.server");
    const result = await computeAnalytics();

    expect(result.totalLeads).toBe(0);
    expect(result.triageToScheduleRate).toBe(0);
    expect(result.noShowPercentage).toBe(0);
    expect(result.revenueAtRisk).toBe(0);
  });

  it("getAnalytics exports server function", async () => {
    const mod = await import("../lib/api/analytics.server");
    expect(mod).toHaveProperty("getAnalytics");
    expect(typeof mod.getAnalytics).toBe("function");
  });
});
