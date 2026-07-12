import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial test for scheduling.server.ts SQL injection fix.
 *
 * Before the fix, bookSlot interpolated leadId and organizationId directly
 * into the SQL string via `${}` instead of binding them as $N parameters.
 * This test proves a malicious leadId is treated as literal data.
 */

const mockDb = { unsafe: vi.fn() };
const mockGetConcurrentLock = vi.fn();
const mockReleaseConcurrentLock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      inputValidator: () => chain,
      handler: (fn: (args: { data: unknown }) => Promise<unknown>) => {
        const wrapped = (args?: { data?: unknown }) => fn({ data: args?.data ?? {} });
        Object.assign(wrapped, { __isServerFn: true });
        return wrapped;
      },
    };
    return chain;
  },
}));

vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  getConcurrentLock: mockGetConcurrentLock,
  releaseConcurrentLock: mockReleaseConcurrentLock,
  isDbAvailable: vi.fn(() => true),
  ensureSchema: vi.fn(() => true),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: new Proxy({}, { get: () => "MOCK_EVENT" }),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({
    orgId: "org-test",
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  })),
}));

vi.mock("@/lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

describe("bookSlot SQL parameterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConcurrentLock.mockResolvedValue(true);
    mockReleaseConcurrentLock.mockResolvedValue(undefined);
  });

  it("passes leadId as bound parameter, not interpolated", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 42,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
      },
    });

    const updateCall = mockDb.unsafe.mock.calls[1];
    const sql = updateCall[0] as string;
    const params = updateCall[1] as unknown[];

    expect(sql).toContain("WHERE id = $2 AND organization_id = $3");
    expect(sql).not.toContain("WHERE id = 42");
    expect(sql).not.toContain("WHERE id = ${");
    expect(params).toEqual(["2026-07-15T10:00:00.000Z", 42, "org-test"]);
  });

  it("treats a malicious leadId with SQL keywords as literal data", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 999,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
      },
    });

    const updateCall = mockDb.unsafe.mock.calls[1];
    const sql = updateCall[0] as string;
    const params = updateCall[1] as unknown[];

    expect(sql).not.toMatch(/DROP|DELETE|INSERT|SELECT|OR 1=1|--/i);
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(params[1]).toBe(999);
  });

  it("correctly indexes parameters with providerId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 7,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
        providerId: 3,
      },
    });

    const updateCall = mockDb.unsafe.mock.calls[1];
    const sql = updateCall[0] as string;
    const params = updateCall[1] as unknown[];

    expect(sql).toContain("provider_id = $2");
    expect(sql).toContain("WHERE id = $3 AND organization_id = $4");
    expect(params).toEqual(["2026-07-15T10:00:00.000Z", 3, 7, "org-test"]);
  });

  it("correctly indexes parameters with both providerId and roomId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 5,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
        providerId: 2,
        roomId: 8,
      },
    });

    const updateCall = mockDb.unsafe.mock.calls[1];
    const sql = updateCall[0] as string;
    const params = updateCall[1] as unknown[];

    expect(sql).toContain("provider_id = $2");
    expect(sql).toContain("room_id = $3");
    expect(sql).toContain("WHERE id = $4 AND organization_id = $5");
    expect(params).toEqual(["2026-07-15T10:00:00.000Z", 2, 8, 5, "org-test"]);
  });

  it("releases lock even on failure", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockRejectedValueOnce(new Error("DB boom"));

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await expect(
      bookSlot({
        data: {
          leadId: 1,
          appointmentTimestamp: "2026-07-15T10:00:00.000Z",
        },
      }),
    ).rejects.toThrow("DB boom");

    expect(mockReleaseConcurrentLock).toHaveBeenCalled();
  });

  it("organizationId comes from requireOrg(), not client input", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 1,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
      },
    });

    const lockCall = mockGetConcurrentLock.mock.calls[0];
    expect(lockCall[0]).toContain("org-test");

    const updateCall = mockDb.unsafe.mock.calls[1];
    const params = updateCall[1] as unknown[];
    expect(params[params.length - 1]).toBe("org-test");
  });
});
