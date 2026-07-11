import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db.server", () => ({
  isDbAvailable: vi.fn(),
  getConnectionError: vi.fn(() => null),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn() },
  EVENTS: { DB_UNAVAILABLE: "DB_UNAVAILABLE" },
  startTimer: () => ({ end: () => 0 }),
}));

describe("Health endpoint response shape", () => {
  it("returns healthy when DB is available", async () => {
    const dbMock = await import("@/lib/db.server");
    vi.mocked(dbMock.isDbAvailable).mockReturnValue(true);

    const { GET } = await import("@/routes/api/health");
    const response = await GET();

    expect(response).toHaveProperty("status", "healthy");
    expect(response).toHaveProperty("dbAvailable", true);
    expect(response).toHaveProperty("queueStatus", "operational");
    expect(response).toHaveProperty("timestamp");
    expect(response).toHaveProperty("uptime");
    expect(response.dbError).toBeNull();
  });

  it("returns degraded status when DB is unavailable", async () => {
    const dbMock = await import("@/lib/db.server");
    vi.mocked(dbMock.isDbAvailable).mockReturnValue(false);
    vi.mocked(dbMock.getConnectionError).mockReturnValue("Connection refused");

    const { GET } = await import("@/routes/api/health");
    const response = await GET();

    expect(response.status).toBe("unhealthy");
    expect(response.dbAvailable).toBe(false);
    expect(response.dbError).toBe("Connection refused");
    expect(response.queueStatus).toBe("unavailable");
  });

  it("timestamp is valid ISO string", async () => {
    const dbMock = await import("@/lib/db.server");
    vi.mocked(dbMock.isDbAvailable).mockReturnValue(true);

    const { GET } = await import("@/routes/api/health");
    const response = await GET();

    const parsed = new Date(response.timestamp);
    expect(parsed.toISOString()).toBe(response.timestamp);
  });

  it("uptime is a positive number", async () => {
    const dbMock = await import("@/lib/db.server");
    vi.mocked(dbMock.isDbAvailable).mockReturnValue(true);

    const { GET } = await import("@/routes/api/health");
    const response = await GET();

    expect(typeof response.uptime).toBe("number");
    expect(response.uptime).toBeGreaterThanOrEqual(0);
  });
});
