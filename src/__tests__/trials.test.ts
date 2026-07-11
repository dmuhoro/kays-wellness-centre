import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    TRIAL_STARTED: "TRIAL_STARTED",
    TRIAL_EXPIRING: "TRIAL_EXPIRING",
    TRIAL_EXPIRED: "TRIAL_EXPIRED",
    TRIAL_CONVERTED: "TRIAL_CONVERTED",
  },
}));
vi.mock("@/lib/audit.server", () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/session.server", () => ({ getSession: vi.fn(() => ({ userId: 1 })) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("Trial Status Retrieval", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns no-trial status when org not found", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getTrialStatus } = await import("@/lib/trials.server");
    const status = await getTrialStatus("org-1");
    expect(status.isTrialActive).toBe(false);
    expect(status.isExpired).toBe(false);
  });

  it("detects active trial with days remaining", async () => {
    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      trial_ends_at: futureDate,
      trial_converted_at: null,
      subscription_status: "trialing",
      subscription_tier: "starter",
    }]);

    const { getTrialStatus } = await import("@/lib/trials.server");
    const status = await getTrialStatus("org-1");
    expect(status.isTrialActive).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(status.daysRemaining).toBeGreaterThanOrEqual(6);
    expect(status.daysRemaining).toBeLessThanOrEqual(8);
  });

  it("detects expired trial", async () => {
    const pastDate = new Date(Date.now() - 2 * 86_400_000).toISOString();
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 16 * 86_400_000).toISOString(),
      trial_ends_at: pastDate,
      trial_converted_at: null,
      subscription_status: "trialing",
      subscription_tier: "starter",
    }]);

    const { getTrialStatus } = await import("@/lib/trials.server");
    const status = await getTrialStatus("org-1");
    expect(status.isTrialActive).toBe(false);
    expect(status.isExpired).toBe(true);
    expect(status.daysRemaining).toBeNull();
  });

  it("detects converted trial", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
      trial_converted_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      subscription_status: "active",
      subscription_tier: "growth",
    }]);

    const { getTrialStatus } = await import("@/lib/trials.server");
    const status = await getTrialStatus("org-1");
    expect(status.isTrialActive).toBe(false);
    expect(status.isExpired).toBe(false);
    expect(status.trialConvertedAt).toBeTruthy();
  });

  it("returns fallback status when DB unavailable", async () => {
    const { isDbAvailable } = await import("@/lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { getTrialStatus } = await import("@/lib/trials.server");
    const status = await getTrialStatus("org-1");
    expect(status.isTrialActive).toBe(false);
  });
});

describe("Trial Start", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("starts 14-day trial and updates org", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        trial_started_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        trial_converted_at: null,
        subscription_status: "trialing",
        subscription_tier: "starter",
      }]);

    const { startTrial } = await import("@/lib/trials.server");
    const status = await startTrial("org-1");
    expect(status.isTrialActive).toBe(true);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE organizations SET"),
      expect.arrayContaining(["org-1"]),
    );
  });

  it("sets subscription_status to trialing", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        trial_started_at: new Date().toISOString(),
        trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        trial_converted_at: null,
        subscription_status: "trialing",
        subscription_tier: "starter",
      }]);

    const { startTrial } = await import("@/lib/trials.server");
    const status = await startTrial("org-1");
    expect(status.subscriptionStatus).toBe("trialing");
  });
});

describe("Trial Access Evaluation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("allows access for active subscription without trial", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: null,
      trial_ends_at: null,
      trial_converted_at: null,
      subscription_status: "active",
      subscription_tier: "starter",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(false);
    expect(eval_.blockAccess).toBe(false);
  });

  it("shows paywall when trial expired", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      trial_converted_at: null,
      subscription_status: "trialing",
      subscription_tier: "starter",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(true);
    expect(eval_.blockAccess).toBe(true);
    expect(eval_.message).toContain("trial has ended");
  });

  it("shows warning when trial expiring within 3 days", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 12 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      trial_converted_at: null,
      subscription_status: "trialing",
      subscription_tier: "starter",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(false);
    expect(eval_.blockAccess).toBe(false);
    expect(eval_.message).toContain("expires in");
  });

  it("allows full access during active trial with >3 days", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() + 11 * 86_400_000).toISOString(),
      trial_converted_at: null,
      subscription_status: "trialing",
      subscription_tier: "starter",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(false);
    expect(eval_.blockAccess).toBe(false);
    expect(eval_.message).toBeNull();
  });

  it("shows paywall for suspended accounts", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: null,
      trial_ends_at: null,
      trial_converted_at: null,
      subscription_status: "suspended",
      subscription_tier: "starter",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(true);
    expect(eval_.blockAccess).toBe(true);
    expect(eval_.message).toContain("suspended");
  });

  it("allows access for converted trials", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      trial_started_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      trial_ends_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      trial_converted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      subscription_status: "active",
      subscription_tier: "growth",
    }]);

    const { evaluateTrialAccess } = await import("@/lib/trials.server");
    const eval_ = await evaluateTrialAccess("org-1");
    expect(eval_.showPaywall).toBe(false);
    expect(eval_.blockAccess).toBe(false);
  });
});

describe("Trial Conversion", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("converts trial to paid tier", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        trial_started_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        trial_ends_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
        trial_converted_at: new Date().toISOString(),
        subscription_status: "active",
        subscription_tier: "growth",
      }]);

    const { convertTrial } = await import("@/lib/trials.server");
    const status = await convertTrial("org-1", "growth");
    expect(status.subscriptionStatus).toBe("active");
    expect(status.trialConvertedAt).toBeTruthy();
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("trial_converted_at"),
      expect.arrayContaining(["org-1", "growth"]),
    );
  });
});

describe("Expiring Soon Query", () => {
  it("returns trials expiring within N days", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: "org-a", trial_ends_at: new Date(Date.now() + 1 * 86_400_000).toISOString() },
      { id: "org-b", trial_ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() },
    ]);

    const { getTrialsExpiringSoon } = await import("@/lib/trials.server");
    const trials = await getTrialsExpiringSoon(3);
    expect(trials).toHaveLength(2);
    expect(trials[0].daysRemaining).toBeGreaterThanOrEqual(0);
    expect(trials[0].daysRemaining).toBeLessThanOrEqual(2);
  });

  it("returns empty when no trials expiring", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getTrialsExpiringSoon } = await import("@/lib/trials.server");
    const trials = await getTrialsExpiringSoon(3);
    expect(trials).toHaveLength(0);
  });
});

describe("Trial Duration Constant", () => {
  it("defines 14-day trial duration", async () => {
    const { TRIAL_DURATION_DAYS } = await import("@/lib/trials.server");
    expect(TRIAL_DURATION_DAYS).toBe(14);
  });
});
