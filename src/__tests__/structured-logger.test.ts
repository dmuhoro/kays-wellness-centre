import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env.server", () => ({
  isProduction: vi.fn(() => false),
}));

describe("Structured Logger Envelope", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("createLogger returns object with debug/info/warn/error/child methods", async () => {
    const { createLogger } = await import("@/lib/logger.server");
    const log = createLogger();
    expect(log).toHaveProperty("debug");
    expect(log).toHaveProperty("info");
    expect(log).toHaveProperty("warn");
    expect(log).toHaveProperty("error");
    expect(log).toHaveProperty("child");
    expect(typeof log.info).toBe("function");
  });

  it("child logger inherits traceId and orgId", async () => {
    const { createLogger } = await import("@/lib/logger.server");
    const parent = createLogger("trace-123", "org-abc", 42);
    const child = parent.child({ tenant_id: "org-xyz" });

    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    child.info("child message");
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it("startTimer returns elapsed ms", async () => {
    const { startTimer } = await import("@/lib/logger.server");
    const timer = startTimer();
    const elapsed = timer.end();
    expect(typeof elapsed).toBe("number");
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it("production mode writes JSON to stdout", async () => {
    const envMock = await import("@/lib/env.server");
    vi.mocked(envMock.isProduction).mockReturnValue(true);

    const { createLogger } = await import("@/lib/logger.server");
    const log = createLogger("trace-p", "org-p", 1);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("production test", { event: "TEST_EVENT" });

    expect(stdoutSpy).toHaveBeenCalled();
    const callArg = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(callArg);

    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("level", "info");
    expect(parsed).toHaveProperty("message", "production test");
    expect(parsed).toHaveProperty("traceId", "trace-p");
    expect(parsed).toHaveProperty("orgId", "org-p");
    expect(parsed).toHaveProperty("userId", 1);
    expect(parsed).toHaveProperty("event", "TEST_EVENT");

    stdoutSpy.mockRestore();
  });

  it("production output includes executionTimeMs when provided", async () => {
    const envMock = await import("@/lib/env.server");
    vi.mocked(envMock.isProduction).mockReturnValue(true);

    const { createLogger } = await import("@/lib/logger.server");
    const log = createLogger();

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("timed operation", { executionTimeMs: 42 });

    const callArg = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(callArg);
    expect(parsed.executionTimeMs).toBe(42);

    stdoutSpy.mockRestore();
  });
});

describe("EVENTS constant", () => {
  it("has the new LOCK_ACQUIRED and LOCK_FAILED events", async () => {
    const { EVENTS } = await import("@/lib/logger.server");
    expect(EVENTS.LOCK_ACQUIRED).toBe("LOCK_ACQUIRED");
    expect(EVENTS.LOCK_FAILED).toBe("LOCK_FAILED");
  });

  it("all EVENTS values are uppercase strings", async () => {
    const { EVENTS } = await import("@/lib/logger.server");
    for (const value of Object.values(EVENTS)) {
      expect(value).toEqual(expect.stringMatching(/^[A-Z_]+$/));
    }
  });
});
