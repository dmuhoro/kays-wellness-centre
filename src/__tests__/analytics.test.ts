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
    INVOICE_GENERATED: "INVOICE_GENERATED",
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

  it("returns financial metrics in snapshot", async () => {
    let callIdx = 0;
    const responses: unknown[][] = [
      [{ status: "contacted", count: 5 }, { status: "scheduled", count: 3 }], // status group
      [{ count: 2 }],  // this week
      [{ count: 8 }],  // this month
      [{ count: 2 }],  // high priority
      [{ priority: "high", count: 2 }, { priority: "medium", count: 3 }], // priority group
      [{ count: 8 }],  // 30 day leads
      [{ total: 15000 }], // AR (draft/issued)
      [{ total: 5000 }],  // MRR (paid this month)
      [ // revenue per resource
        { resourceId: 1, name: "Dr. Smith", type: "PROVIDER", revenue: 8000, appointmentCount: 4 },
        { resourceId: 2, name: "Room A", type: "ROOM", revenue: 3000, appointmentCount: 2 },
      ],
      [{ paid: 5000, total: 15000 }], // collection
    ];
    mockUnsafe.mockImplementation(() => {
      const res = responses[callIdx] ?? [];
      callIdx++;
      return res;
    });

    const { computeAnalytics } = await import("../lib/analytics.server");
    const result = await computeAnalytics();

    expect(result).toHaveProperty("accountsReceivable", 15000);
    expect(result).toHaveProperty("monthlyRecurringRevenue", 5000);
    expect(result).toHaveProperty("collectionRate", 33);
    expect(result).toHaveProperty("revenuePerResource");
    expect(result.revenuePerResource.length).toBe(2);
    expect(result.revenuePerResource[0].name).toBe("Dr. Smith");
    expect(result.revenuePerResource[0].revenue).toBe(8000);
  });

  it("calculates collection rate as zero when no invoices exist", async () => {
    let idx = 0;
    mockUnsafe.mockImplementation(() => {
      idx++;
      return [];
    });

    const { computeAnalytics } = await import("../lib/analytics.server");
    const result = await computeAnalytics();

    expect(result.accountsReceivable).toBe(0);
    expect(result.monthlyRecurringRevenue).toBe(0);
    expect(result.collectionRate).toBe(0);
    expect(result.revenuePerResource).toEqual([]);
  });
});
