import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    FORECAST_COMPUTED: "FORECAST_COMPUTED",
  },
}));

const mockVelocityRows = [
  { stage_from: "new", stage_to: "contacted", avg_hours: 4.5, median_hours: 2.0, sample_size: 120 },
  { stage_from: "contacted", stage_to: "qualified", avg_hours: 24.0, median_hours: 18.0, sample_size: 80 },
  { stage_from: "qualified", stage_to: "booked", avg_hours: 48.0, median_hours: 36.0, sample_size: 60 },
  { stage_from: "booked", stage_to: "checked_in", avg_hours: 12.0, median_hours: 8.0, sample_size: 55 },
  { stage_from: "checked_in", stage_to: "converted", avg_hours: 2.0, median_hours: 1.5, sample_size: 50 },
];

const mockRiskRows = [
  { lead_id: 1, lead_name: "Alice", phone: "254711111111", status: "contacted", hours_in_stage: 200 },
  { lead_id: 2, lead_name: "Bob", phone: "254722222222", status: "qualified", hours_in_stage: 90 },
  { lead_id: 3, lead_name: "Carol", phone: "254733333333", status: "booked", hours_in_stage: 30 },
];

describe("Conversion Velocity Computation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns stage-to-stage velocity metrics", async () => {
    mockDb.unsafe.mockResolvedValueOnce(mockVelocityRows);

    const { computeConversionVelocity } = await import("@/lib/forecasting.server");
    const velocity = await computeConversionVelocity("org-1");

    expect(velocity).toHaveLength(5);
    expect(velocity[0]).toEqual({
      stageFrom: "new",
      stageTo: "contacted",
      avgHours: 4.5,
      medianHours: 2.0,
      sampleSize: 120,
    });
  });

  it("queries with correct org ID", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { computeConversionVelocity } = await import("@/lib/forecasting.server");
    await computeConversionVelocity("org-abc");

    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("organization_id = $1"),
      ["org-abc"],
    );
  });
});

describe("Revenue at Risk", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("labels critical risk for leads stuck > 168 hours", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ avg_val: 2500 }])
      .mockResolvedValueOnce(mockRiskRows);

    const { computeRevenueAtRisk } = await import("@/lib/forecasting.server");
    const risk = await computeRevenueAtRisk("org-1");

    expect(risk).toHaveLength(3);
    expect(risk[0].riskLevel).toBe("critical");
    expect(risk[0].leadName).toBe("Alice");
  });

  it("labels high risk for 72-168 hours", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ avg_val: 3000 }])
      .mockResolvedValueOnce([{ lead_id: 1, lead_name: "Test", phone: null, status: "qualified", hours_in_stage: 100 }]);

    const { computeRevenueAtRisk } = await import("@/lib/forecasting.server");
    const risk = await computeRevenueAtRisk("org-1");
    expect(risk[0].riskLevel).toBe("high");
  });

  it("labels medium risk for 24-72 hours", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ avg_val: 2500 }])
      .mockResolvedValueOnce([{ lead_id: 1, lead_name: "Test", phone: null, status: "booked", hours_in_stage: 40 }]);

    const { computeRevenueAtRisk } = await import("@/lib/forecasting.server");
    const risk = await computeRevenueAtRisk("org-1");
    expect(risk[0].riskLevel).toBe("medium");
  });

  it("labels low risk for < 24 hours", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ avg_val: 2500 }])
      .mockResolvedValueOnce([{ lead_id: 1, lead_name: "Test", phone: null, status: "new", hours_in_stage: 5 }]);

    const { computeRevenueAtRisk } = await import("@/lib/forecasting.server");
    const risk = await computeRevenueAtRisk("org-1");
    expect(risk[0].riskLevel).toBe("low");
  });

  it("uses default estimate when no invoices exist", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ avg_val: null }])
      .mockResolvedValueOnce([{ lead_id: 1, lead_name: "Test", phone: null, status: "new", hours_in_stage: 10 }]);

    const { computeRevenueAtRisk } = await import("@/lib/forecasting.server");
    const risk = await computeRevenueAtRisk("org-1");
    expect(risk[0].estimatedValue).toBe(2500);
  });
});

describe("Pipeline Forecast", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("computes full pipeline forecast with summary stats", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{
        total_leads: 200,
        total_converted: 50,
        total_revenue: 125000,
        avg_conversion_hours: 72.5,
      }])
      .mockResolvedValueOnce(mockVelocityRows)
      .mockResolvedValueOnce([{ avg_val: 2500 }])
      .mockResolvedValueOnce(mockRiskRows)
      .mockResolvedValueOnce([{ days: 60 }]);

    const { computePipelineForecast } = await import("@/lib/forecasting.server");
    const forecast = await computePipelineForecast("org-1");

    expect(forecast.orgId).toBe("org-1");
    expect(forecast.computedAt).toBeTruthy();
    expect(forecast.conversionVelocity).toHaveLength(5);
    expect(forecast.revenueAtRisk).toHaveLength(3);
    expect(forecast.pipelineSummary.totalLeads).toBe(200);
    expect(forecast.pipelineSummary.totalConverted).toBe(50);
    expect(forecast.pipelineSummary.conversionRate).toBe(25);
    expect(forecast.pipelineSummary.avgConversionHours).toBe(72.5);
    expect(forecast.pipelineSummary.projectedMonthlyRevenue).toBeGreaterThan(0);
  });

  it("handles zero leads gracefully", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ total_leads: 0, total_converted: 0, total_revenue: 0, avg_conversion_hours: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ days: 30 }]);

    const { computePipelineForecast } = await import("@/lib/forecasting.server");
    const forecast = await computePipelineForecast("org-1");

    expect(forecast.pipelineSummary.conversionRate).toBe(0);
    expect(forecast.pipelineSummary.projectedMonthlyRevenue).toBe(0);
  });

  it("projected revenue scales with days active", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ total_leads: 100, total_converted: 20, total_revenue: 50000, avg_conversion_hours: 48 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ avg_val: 2500 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ days: 10 }]);

    const { computePipelineForecast } = await import("@/lib/forecasting.server");
    const forecast = await computePipelineForecast("org-1");

    expect(forecast.pipelineSummary.projectedMonthlyRevenue).toBe(150000);
  });
});
