import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    MILESTONE_TRACKED: "MILESTONE_TRACKED",
  },
}));
vi.mock("@/lib/session.server", () => ({ getSession: vi.fn(() => ({ userId: 1 })) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("Milestone Tracking — First Time", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("tracks a new milestone successfully", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { trackUserMilestone } = await import("@/lib/telemetry.server");
    const result = await trackUserMilestone("org-1", "FIRST_LEAD_CREATED");

    expect(result.tracked).toBe(true);
    expect(result.isNew).toBe(true);
  });

  it("returns not-new for duplicate milestone", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ id: 1 }]);

    const { trackUserMilestone } = await import("@/lib/telemetry.server");
    const result = await trackUserMilestone("org-1", "FIRST_LEAD_CREATED");

    expect(result.tracked).toBe(true);
    expect(result.isNew).toBe(false);
  });

  it("rejects unknown milestone keys", async () => {
    const { trackUserMilestone } = await import("@/lib/telemetry.server");
    const result = await trackUserMilestone("org-1", "NONEXISTENT_MILESTONE");

    expect(result.tracked).toBe(false);
    expect(result.isNew).toBe(false);
  });

  it("returns not-tracked when DB unavailable", async () => {
    const { isDbAvailable } = await import("@/lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const { trackUserMilestone } = await import("@/lib/telemetry.server");
    const result = await trackUserMilestone("org-1", "FIRST_LEAD_CREATED");

    expect(result.tracked).toBe(false);
  });
});

describe("Milestone Definitions", () => {
  it("defines 13 milestone keys", async () => {
    const { listMilestones } = await import("@/lib/telemetry.server");
    const milestones = listMilestones();
    expect(milestones.length).toBeGreaterThanOrEqual(12);
  });

  it("each milestone has key, label, category, description", async () => {
    const { listMilestones } = await import("@/lib/telemetry.server");
    const milestones = listMilestones();
    for (const m of milestones) {
      expect(m.key).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(["activation", "engagement", "revenue", "retention"]).toContain(m.category);
      expect(m.description).toBeTruthy();
    }
  });

  it("getMilestoneDefinition returns known milestone", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    const def = getMilestoneDefinition("FIRST_INVOICE_ISSUED");
    expect(def).toBeDefined();
    expect(def!.category).toBe("revenue");
  });

  it("getMilestoneDefinition returns undefined for unknown", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    const def = getMilestoneDefinition("DOES_NOT_EXIST");
    expect(def).toBeUndefined();
  });
});

describe("Has Milestone Check", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns true when milestone exists", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ id: 1 }]);
    const { hasMilestone } = await import("@/lib/telemetry.server");
    expect(await hasMilestone("org-1", "FIRST_LEAD_CREATED")).toBe(true);
  });

  it("returns false when milestone doesn't exist", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { hasMilestone } = await import("@/lib/telemetry.server");
    expect(await hasMilestone("org-1", "FIRST_LEAD_CREATED")).toBe(false);
  });

  it("returns false when DB unavailable", async () => {
    const { isDbAvailable } = await import("@/lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { hasMilestone } = await import("@/lib/telemetry.server");
    expect(await hasMilestone("org-1", "FIRST_LEAD_CREATED")).toBe(false);
  });
});

describe("Org Milestones Retrieval", () => {
  it("returns all milestones for org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, organization_id: "org-1", user_id: 1, milestone_key: "FIRST_LEAD_CREATED", milestone_label: "First Lead Created", metadata: {}, created_at: "2026-07-01T10:00:00Z" },
      { id: 2, organization_id: "org-1", user_id: 1, milestone_key: "ONBOARDING_COMPLETED", milestone_label: "Onboarding Completed", metadata: {}, created_at: "2026-07-01T10:05:00Z" },
    ]);

    const { getOrgMilestones } = await import("@/lib/telemetry.server");
    const milestones = await getOrgMilestones("org-1");
    expect(milestones).toHaveLength(2);
    expect(milestones[0].milestoneKey).toBe("FIRST_LEAD_CREATED");
    expect(milestones[0].category).toBe("activation");
    expect(milestones[1].milestoneKey).toBe("ONBOARDING_COMPLETED");
  });

  it("returns empty when no milestones", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getOrgMilestones } = await import("@/lib/telemetry.server");
    expect(await getOrgMilestones("org-1")).toHaveLength(0);
  });
});

describe("Milestone Stats", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("computes milestone stats with activation rate", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ count: "100" }])
      .mockResolvedValueOnce([
        { milestone_key: "FIRST_LEAD_CREATED", count: "80" },
        { milestone_key: "ONBOARDING_COMPLETED", count: "60" },
      ])
      .mockResolvedValueOnce([{ count: "60" }]);

    const { getMilestoneStats } = await import("@/lib/telemetry.server");
    const stats = await getMilestoneStats();
    expect(stats.totalOrgs).toBe(100);
    expect(stats.orgsWithMilestones).toBe(60);
    expect(stats.activationRate).toBe(60);
    expect(stats.milestoneCounts["FIRST_LEAD_CREATED"]).toBe(80);
  });

  it("returns zeros when DB unavailable", async () => {
    const { isDbAvailable } = await import("@/lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const { getMilestoneStats } = await import("@/lib/telemetry.server");
    const stats = await getMilestoneStats();
    expect(stats.totalOrgs).toBe(0);
    expect(stats.activationRate).toBe(0);
  });
});

describe("Milestone Categories", () => {
  it("FIRST_CSV_IMPORTED is activation category", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    expect(getMilestoneDefinition("FIRST_CSV_IMPORTED")!.category).toBe("activation");
  });

  it("FIRST_PAYMENT_RECEIVED is revenue category", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    expect(getMilestoneDefinition("FIRST_PAYMENT_RECEIVED")!.category).toBe("revenue");
  });

  it("STREAK_7_DAYS is retention category", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    expect(getMilestoneDefinition("STREAK_7_DAYS")!.category).toBe("retention");
  });

  it("FIRST_WHATSAPP_SENT is engagement category", async () => {
    const { getMilestoneDefinition } = await import("@/lib/telemetry.server");
    expect(getMilestoneDefinition("FIRST_WHATSAPP_SENT")!.category).toBe("engagement");
  });
});
