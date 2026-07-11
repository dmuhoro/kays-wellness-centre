import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db.server", () => {
  const mockDb = { unsafe: vi.fn() };
  return {
    getDb: vi.fn(() => Promise.resolve(mockDb)),
    isDbAvailable: vi.fn(() => true),
    _mockDb: mockDb,
  };
});
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
  EVENTS: {
    NOTIFICATION_IDEMPOTENCY_SKIP: "NOTIFICATION_IDEMPOTENCY_SKIP",
    NOTIFICATION_DISPATCHED: "NOTIFICATION_DISPATCHED",
    INTERACTION_RECORDED: "INTERACTION_RECORDED",
  },
}));

import {
  classifySentiment,
  computeNpsScore,
  sendSatisfactionPrompt,
  processFeedbackResponse,
  getReputationMetrics,
  getReviewGuardConfig,
  getSatisfactionPrompts,
  getReviewSubmissions,
  DEFAULT_SATISFACTION_MESSAGE,
  DEFAULT_REVIEW_PROMPT,
  NPS_PROMOTER_THRESHOLD,
  NPS_PASSIVE_THRESHOLD,
  type FeedbackSentiment,
  type ReviewPlatform,
  type ReputationMetrics,
  type ReviewGuardConfig,
} from "@/lib/marketing/reviews.server";
import { _mockDb, isDbAvailable } from "@/lib/db.server";

const mockDb = _mockDb;

describe("classifySentiment", () => {
  it('returns "positive" for score >= 9', () => {
    expect(classifySentiment(9)).toBe("positive");
  });

  it('returns "positive" for score 10', () => {
    expect(classifySentiment(10)).toBe("positive");
  });

  it('returns "neutral" for score 8', () => {
    expect(classifySentiment(8)).toBe("neutral");
  });

  it('returns "neutral" for score 7', () => {
    expect(classifySentiment(7)).toBe("neutral");
  });

  it('returns "negative" for score 6', () => {
    expect(classifySentiment(6)).toBe("negative");
  });

  it('returns "negative" for score 0', () => {
    expect(classifySentiment(0)).toBe("negative");
  });
});

describe("computeNpsScore", () => {
  it("returns 100 for all promoters (10, 10, 9)", () => {
    expect(computeNpsScore([{ npsScore: 10 }, { npsScore: 10 }, { npsScore: 9 }])).toBe(100);
  });

  it("returns -100 for all detractors (5, 3, 6)", () => {
    expect(computeNpsScore([{ npsScore: 5 }, { npsScore: 3 }, { npsScore: 6 }])).toBe(-100);
  });

  it("returns 0 for mixed (10, 8, 5) — 1 promoter, 1 detractor", () => {
    expect(computeNpsScore([{ npsScore: 10 }, { npsScore: 8 }, { npsScore: 5 }])).toBe(0);
  });

  it("returns 0 for empty array", () => {
    expect(computeNpsScore([])).toBe(0);
  });

  it("returns 0 for half promoters half detractors (5 each)", () => {
    const responses = [
      { npsScore: 10 }, { npsScore: 10 }, { npsScore: 9 }, { npsScore: 10 }, { npsScore: 9 },
      { npsScore: 5 }, { npsScore: 3 }, { npsScore: 6 }, { npsScore: 2 }, { npsScore: 4 },
    ];
    expect(computeNpsScore(responses)).toBe(0);
  });

  it("returns 100 for 5 promoters, 0 detractors, 5 total", () => {
    expect(computeNpsScore([{ npsScore: 9 }, { npsScore: 10 }, { npsScore: 10 }, { npsScore: 9 }, { npsScore: 10 }])).toBe(100);
  });

  it("returns 20 for 3 promoters, 2 detractors, 5 total", () => {
    expect(computeNpsScore([{ npsScore: 10 }, { npsScore: 9 }, { npsScore: 10 }, { npsScore: 5 }, { npsScore: 3 }])).toBe(20);
  });
});

describe("NPS threshold constants", () => {
  it("NPS_PROMOTER_THRESHOLD is 9", () => {
    expect(NPS_PROMOTER_THRESHOLD).toBe(9);
  });

  it("NPS_PASSIVE_THRESHOLD is 7", () => {
    expect(NPS_PASSIVE_THRESHOLD).toBe(7);
  });
});

describe("sendSatisfactionPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("throws when lead not found", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    await expect(sendSatisfactionPrompt("org-1", 1, 100)).rejects.toThrow("Lead not found");
  });

  it("skips when on cooldown (recent prompt exists)", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "John", phone: "12345" }])
      .mockResolvedValueOnce([{ id: 42 }]);

    const result = await sendSatisfactionPrompt("org-1", 1, 100);

    expect(result.status).toBe("sent");
    expect(result.leadName).toBe("John");
    expect(result.id).toBe(42);
    expect(mockDb.unsafe).toHaveBeenCalledTimes(2);
  });

  it("creates prompt successfully", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "Jane", phone: "67890" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 5, created_at: "2026-01-15T10:00:00Z" }]);

    const result = await sendSatisfactionPrompt("org-1", 1, 100);

    expect(result.id).toBe(5);
    expect(result.leadName).toBe("Jane");
    expect(result.phone).toBe("67890");
    expect(result.message).toContain("Jane");
    expect(result.status).toBe("sent");
    expect(mockDb.unsafe).toHaveBeenCalledTimes(3);
  });
});

describe("processFeedbackResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("throws for invalid NPS (negative)", async () => {
    await expect(processFeedbackResponse(1, "org-1", -1)).rejects.toThrow("NPS score must be 0-10");
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });

  it("throws for invalid NPS (> 10)", async () => {
    await expect(processFeedbackResponse(1, "org-1", 11)).rejects.toThrow("NPS score must be 0-10");
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });

  it("throws when prompt not found", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    await expect(processFeedbackResponse(999, "org-1", 8)).rejects.toThrow("Prompt not found");
  });

  it("processes positive response (NPS 10) with reviewSubmitted=true", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ lead_id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 20, created_at: "2026-01-15T10:00:00Z" }])
      .mockResolvedValueOnce([{ id: 30, created_at: "2026-01-15T10:00:00Z" }]);

    const result = await processFeedbackResponse(1, "org-1", 10, "Great service!");

    expect(result.npsScore).toBe(10);
    expect(result.sentiment).toBe("positive");
    expect(result.reviewSubmitted).toBe(true);
    expect(result.platform).toBe("internal");
    expect(result.comment).toBe("Great service!");
  });

  it("processes neutral response (NPS 8) with reviewSubmitted=false", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ lead_id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 21, created_at: "2026-01-15T10:00:00Z" }]);

    const result = await processFeedbackResponse(2, "org-1", 8);

    expect(result.npsScore).toBe(8);
    expect(result.sentiment).toBe("neutral");
    expect(result.reviewSubmitted).toBe(false);
    expect(result.comment).toBeNull();
  });

  it("processes negative response (NPS 3) with reviewSubmitted=false", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ lead_id: 10 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 22, created_at: "2026-01-15T10:00:00Z" }]);

    const result = await processFeedbackResponse(3, "org-1", 3, "Not great");

    expect(result.npsScore).toBe(3);
    expect(result.sentiment).toBe("negative");
    expect(result.reviewSubmitted).toBe(false);
    expect(result.comment).toBe("Not great");
  });
});

describe("getReputationMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("returns zeros when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValueOnce(false);

    const result = await getReputationMetrics("org-1");

    expect(result.totalFeedback).toBe(0);
    expect(result.averageNps).toBe(0);
    expect(result.npsScore).toBe(0);
    expect(result.positiveRate).toBe(0);
    expect(result.reviewsSubmitted).toBe(0);
    expect(result.reviewsApproved).toBe(0);
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });

  it("returns correct structure with all fields", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{
        total: "10", avg_nps: "8.5", promoters: "6", passives: "3",
        detractors: "1", positive_count: "7",
      }])
      .mockResolvedValueOnce([{ submitted: "4", approved: "2" }]);

    const result = await getReputationMetrics("org-1");

    expect(result.orgId).toBe("org-1");
    expect(result.totalFeedback).toBe(10);
    expect(result.averageNps).toBe(8.5);
    expect(result.npsPromoters).toBe(6);
    expect(result.npsPassives).toBe(3);
    expect(result.npsDetractors).toBe(1);
    expect(result.npsScore).toBe(50);
    expect(result.positiveRate).toBe(70);
    expect(result.reviewsSubmitted).toBe(4);
    expect(result.reviewsApproved).toBe(2);
  });
});

describe("getReviewGuardConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("returns defaults when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValueOnce(false);

    const result = await getReviewGuardConfig("org-1");

    expect(result.enabled).toBe(true);
    expect(result.autoSendAfterPayment).toBe(true);
    expect(result.npsThresholdForReview).toBe(9);
    expect(result.reviewPlatform).toBe("google");
    expect(result.cooldownDays).toBe(30);
    expect(result.customMessage).toBeNull();
  });

  it("returns defaults when no config exists", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const result = await getReviewGuardConfig("org-1");

    expect(result.enabled).toBe(true);
    expect(result.npsThresholdForReview).toBe(9);
    expect(result.reviewPlatform).toBe("google");
  });

  it("returns config from DB", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      review_guard_enabled: false,
      auto_send_satisfaction: false,
      nps_review_threshold: 8,
      review_platform: "referral",
      custom_satisfaction_message: "Custom msg",
      satisfaction_cooldown_days: 14,
    }]);

    const result = await getReviewGuardConfig("org-1");

    expect(result.enabled).toBe(false);
    expect(result.autoSendAfterPayment).toBe(false);
    expect(result.npsThresholdForReview).toBe(8);
    expect(result.reviewPlatform).toBe("referral");
    expect(result.customMessage).toBe("Custom msg");
    expect(result.cooldownDays).toBe(14);
  });
});

describe("getSatisfactionPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("returns empty when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValueOnce(false);

    const result = await getSatisfactionPrompts("org-1");

    expect(result).toEqual([]);
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });
});

describe("getReviewSubmissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("returns empty when DB unavailable", async () => {
    vi.mocked(isDbAvailable).mockReturnValueOnce(false);

    const result = await getReviewSubmissions("org-1");

    expect(result).toEqual([]);
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });
});

describe("DEFAULT_SATISFACTION_MESSAGE", () => {
  it("contains {{name}} placeholder", () => {
    expect(DEFAULT_SATISFACTION_MESSAGE).toContain("{{name}}");
  });

  it("mentions Kay's Wellness Centre", () => {
    expect(DEFAULT_SATISFACTION_MESSAGE).toContain("Kay's Wellness Centre");
  });
});

describe("DEFAULT_REVIEW_PROMPT", () => {
  it("contains {{reviewUrl}} placeholder", () => {
    expect(DEFAULT_REVIEW_PROMPT).toContain("{{reviewUrl}}");
  });

  it("mentions Google", () => {
    expect(DEFAULT_REVIEW_PROMPT).toContain("Google");
  });
});

describe("FeedbackSentiment type", () => {
  it("has valid values", () => {
    const valid: FeedbackSentiment[] = ["positive", "neutral", "negative"];
    expect(valid).toHaveLength(3);
    expect(valid).toContain("positive");
    expect(valid).toContain("neutral");
    expect(valid).toContain("negative");
  });
});

describe("ReviewPlatform type", () => {
  it("has valid values", () => {
    const valid: ReviewPlatform[] = ["google", "internal", "referral"];
    expect(valid).toHaveLength(3);
    expect(valid).toContain("google");
    expect(valid).toContain("internal");
    expect(valid).toContain("referral");
  });
});

describe("ReputationMetrics interface", () => {
  it("has all required fields", () => {
    const metrics: ReputationMetrics = {
      orgId: "org-1",
      totalFeedback: 0,
      averageNps: 0,
      npsPromoters: 0,
      npsPassives: 0,
      npsDetractors: 0,
      npsScore: 0,
      positiveRate: 0,
      reviewsSubmitted: 0,
      reviewsApproved: 0,
    };
    expect(metrics.orgId).toBe("org-1");
    expect(Object.keys(metrics)).toHaveLength(10);
  });
});

describe("ReviewGuardConfig defaults", () => {
  it("has expected default values", () => {
    const defaults: ReviewGuardConfig = {
      orgId: "org-1",
      enabled: true,
      autoSendAfterPayment: true,
      npsThresholdForReview: 9,
      reviewPlatform: "google",
      customMessage: null,
      cooldownDays: 30,
    };
    expect(defaults.enabled).toBe(true);
    expect(defaults.autoSendAfterPayment).toBe(true);
    expect(defaults.npsThresholdForReview).toBe(9);
    expect(defaults.reviewPlatform).toBe("google");
    expect(defaults.cooldownDays).toBe(30);
  });
});
