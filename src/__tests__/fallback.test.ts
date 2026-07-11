import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    FALLBACK_TRIGGERED: "FALLBACK_TRIGGERED",
    FALLBACK_DELIVERED: "FALLBACK_DELIVERED",
    CONFIG_UPDATED: "CONFIG_UPDATED",
  },
}));

function freshMocks() {
  vi.clearAllMocks();
  mockDb.unsafe.mockReset();
}

describe("Channel Health Tracking", () => {
  beforeEach(freshMocks);

  it("records delivery attempt - success increments success_count", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, organization_id: "org-1", channel: "webhook", success_count: 2, fail_count: 1, circuit_open: false, circuit_open_until: null },
    ]);

    const { recordDeliveryAttempt } = await import("@/lib/fallback.server");
    await recordDeliveryAttempt("org-1", "webhook", true);

    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE channel_health"),
      expect.arrayContaining(["org-1", "webhook"]),
    );
  });

  it("opens circuit breaker after 5 consecutive failures", async () => {
    mockDb.unsafe.mockResolvedValue([
      { id: 1, organization_id: "org-1", channel: "sms", success_count: 10, fail_count: 4, circuit_open: false, circuit_open_until: null },
    ]);

    const { recordDeliveryAttempt } = await import("@/lib/fallback.server");
    await recordDeliveryAttempt("org-1", "sms", false);

    const updateCall = mockDb.unsafe.mock.calls.find((c: unknown[]) =>
      Array.isArray(c) && typeof c[0] === "string" && c[0].includes("UPDATE channel_health"),
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toContain("circuit_open = $7");
    expect(updateCall![1][6]).toBe(true);
  });

  it("creates new health record if none exists", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { recordDeliveryAttempt } = await import("@/lib/fallback.server");
    await recordDeliveryAttempt("org-1", "whatsapp", true);

    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO channel_health"),
      expect.arrayContaining(["org-1", "whatsapp"]),
    );
  });
});

describe("Available Channels with Circuit Breaker", () => {
  beforeEach(freshMocks);

  it("returns all channels when none are circuit-broken", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }]);

    const { getAvailableChannels } = await import("@/lib/fallback.server");
    const channels = await getAvailableChannels("org-1");
    expect(channels).toEqual(["webhook", "whatsapp", "sms"]);
  });

  it("excludes circuit-broken channels", async () => {
    const futureDate = new Date(Date.now() + 60000).toISOString();
    mockDb.unsafe
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: futureDate }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }]);

    const { getAvailableChannels } = await import("@/lib/fallback.server");
    const channels = await getAvailableChannels("org-1");
    expect(channels).not.toContain("webhook");
    expect(channels).toContain("whatsapp");
    expect(channels).toContain("sms");
  });

  it("includes channel if circuit breaker expired", async () => {
    const pastDate = new Date(Date.now() - 60000).toISOString();
    mockDb.unsafe
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: pastDate }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }]);

    const { getAvailableChannels } = await import("@/lib/fallback.server");
    const channels = await getAvailableChannels("org-1");
    expect(channels).toContain("webhook");
  });

  it("returns empty when all channels are broken", async () => {
    const futureDate = new Date(Date.now() + 60000).toISOString();
    mockDb.unsafe
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: futureDate }])
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: futureDate }])
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: futureDate }]);

    const { getAvailableChannels } = await import("@/lib/fallback.server");
    const channels = await getAvailableChannels("org-1");
    expect(channels).toEqual([]);
  });
});

describe("sendWithFallback", () => {
  beforeEach(freshMocks);

  it("uses primary channel on first success", async () => {
    mockDb.unsafe.mockResolvedValue([{ circuit_open: false }]);

    const sendFn = vi.fn().mockResolvedValue(true);
    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.channel).toBe("webhook");
    expect(result.status).toBe("delivered");
    expect(result.fallbackUsed).toBe(false);
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to whatsapp when webhook fails", async () => {
    mockDb.unsafe.mockResolvedValue([{ circuit_open: false }]);

    const sendFn = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.channel).toBe("whatsapp");
    expect(result.status).toBe("delivered");
    expect(result.fallbackUsed).toBe(true);
    expect(result.attemptedChannels).toContain("webhook");
    expect(result.attemptedChannels).toContain("whatsapp");
  });

  it("falls back to sms when both webhook and whatsapp fail", async () => {
    mockDb.unsafe.mockResolvedValue([{ circuit_open: false }]);

    const sendFn = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.channel).toBe("sms");
    expect(result.status).toBe("delivered");
    expect(result.fallbackUsed).toBe(true);
  });

  it("returns failed when all channels fail", async () => {
    mockDb.unsafe.mockResolvedValue([{ circuit_open: false }]);

    const sendFn = vi.fn().mockResolvedValue(false);
    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.status).toBe("failed");
    expect(result.attemptedChannels).toHaveLength(3);
  });

  it("handles send function throwing exceptions", async () => {
    mockDb.unsafe.mockResolvedValue([{ circuit_open: false }]);

    const sendFn = vi.fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(true);

    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.status).toBe("delivered");
    expect(result.channel).toBe("whatsapp");
  });

  it("skips broken primary and starts with first available", async () => {
    const futureDate = new Date(Date.now() + 60000).toISOString();
    mockDb.unsafe
      .mockResolvedValueOnce([{ circuit_open: true, circuit_open_until: futureDate }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValueOnce([{ circuit_open: false }])
      .mockResolvedValue([]);

    const sendFn = vi.fn().mockResolvedValue(true);
    const { sendWithFallback } = await import("@/lib/fallback.server");
    const result = await sendWithFallback("org-1", "+254712345678", "Hello", "webhook", sendFn);

    expect(result.channel).toBe("whatsapp");
    expect(result.fallbackUsed).toBe(true);
    expect(sendFn).toHaveBeenCalledWith("whatsapp", "+254712345678", "Hello");
  });
});

describe("Channel Health Report", () => {
  it("returns all channel health records for org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, channel: "webhook", success_count: 10, fail_count: 2 },
      { id: 2, channel: "sms", success_count: 5, fail_count: 1 },
    ]);

    const { getChannelHealthReport } = await import("@/lib/fallback.server");
    const report = await getChannelHealthReport("org-1");
    expect(report).toHaveLength(2);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("channel_health"),
      ["org-1"],
    );
  });
});

describe("Reset Circuit Breaker", () => {
  it("resets circuit and logs event", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { resetChannelCircuit } = await import("@/lib/fallback.server");
    await resetChannelCircuit("org-1", "webhook");

    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("circuit_open = false"),
      ["org-1", "webhook"],
    );
  });
});
