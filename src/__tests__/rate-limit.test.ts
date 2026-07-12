import { describe, it, expect, beforeEach } from "vitest";

describe("rate limiter", () => {
  beforeEach(async () => {
    const mod = await import("@/lib/rate-limit.server");
    mod.resetRateLimit("test:key-1");
    mod.resetRateLimit("test:key-2");
    mod.resetRateLimit("test:key-3");
  });

  it("allows requests within limit", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("test:key-1", 5, 60_000)).toBe(true);
    }
  });

  it("blocks requests exceeding limit", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test:key-2", 5, 60_000);
    }
    expect(checkRateLimit("test:key-2", 5, 60_000)).toBe(false);
  });

  it("resets after window expires", async () => {
    const { checkRateLimit, resetRateLimit } = await import("@/lib/rate-limit.server");
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test:key-3", 5, 60_000);
    }
    expect(checkRateLimit("test:key-3", 5, 60_000)).toBe(false);
    resetRateLimit("test:key-3");
    expect(checkRateLimit("test:key-3", 5, 60_000)).toBe(true);
  });

  it("tracks remaining and reset time", async () => {
    const { checkRateLimit, getRateLimitRemaining } = await import("@/lib/rate-limit.server");
    checkRateLimit("test:key-1", 5, 60_000);
    checkRateLimit("test:key-1", 5, 60_000);
    const remaining = getRateLimitRemaining("test:key-1", 5, 60_000);
    expect(remaining.remaining).toBe(3);
    expect(remaining.resetMs).toBeGreaterThan(0);
    expect(remaining.resetMs).toBeLessThanOrEqual(60_000);
  });

  it("isolates different keys", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit.server");
    for (let i = 0; i < 5; i++) {
      checkRateLimit("test:key-1", 5, 60_000);
    }
    expect(checkRateLimit("test:key-1", 5, 60_000)).toBe(false);
    expect(checkRateLimit("test:key-2", 5, 60_000)).toBe(true);
  });
});
