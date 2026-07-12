import { describe, it, expect, vi, beforeEach } from "vitest";

describe("env.server — SESSION_SECRET production guard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("getEnv throws FATAL when NODE_ENV=production and SESSION_SECRET is default", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "dev-secret-change-in-prod");

    const { getEnv } = await import("../lib/env.server");
    expect(() => getEnv()).toThrow(/FATAL.*SESSION_SECRET.*default/i);
  });

  it("getEnv succeeds when NODE_ENV=development and SESSION_SECRET is default", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "dev-secret-change-in-prod");

    const { getEnv } = await import("../lib/env.server");
    const result = getEnv();
    expect(result.NODE_ENV).toBe("development");
  });

  it("getEnv succeeds when NODE_ENV=production and SESSION_SECRET is custom", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/test");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "a-very-strong-secret-key-that-is-at-least-32-chars");

    const { getEnv } = await import("../lib/env.server");
    const result = getEnv();
    expect(result.NODE_ENV).toBe("production");
  });
});
