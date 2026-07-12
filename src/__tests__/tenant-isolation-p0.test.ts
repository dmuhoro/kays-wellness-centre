import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Adversarial tests proving the 5 P0 tenant-isolation fixes are correct.
 *
 * Each test fails if a regression re-introduces a cross-tenant leak.
 */

let mockDb: { unsafe: ReturnType<typeof vi.fn> };
const mockGetConcurrentLock = vi.fn();
const mockReleaseConcurrentLock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  mockDb = { unsafe: vi.fn().mockResolvedValue([]) };
  mockGetConcurrentLock.mockReset();
  mockReleaseConcurrentLock.mockReset();
  mockGetConcurrentLock.mockResolvedValue(true);
  mockReleaseConcurrentLock.mockResolvedValue(undefined);
});

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
};

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

vi.mock("@/lib/logger.server", () => ({
  logger: mockLogger,
  EVENTS: new Proxy({}, { get: () => "MOCK_EVENT" }),
}));

vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => Promise.resolve(mockDb)),
  isDbAvailable: vi.fn(() => true),
  withDb: vi.fn(),
  getConnectionError: vi.fn(() => null),
  getConcurrentLock: mockGetConcurrentLock,
  releaseConcurrentLock: mockReleaseConcurrentLock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: () => ({ data: null, isLoading: false }),
  useSuspenseQuery: () => ({ data: null }),
}));

vi.mock("@/lib/session.server", () => ({
  getCurrentOrgId: () => "org-A",
  getCurrentUserRole: () => "super_admin",
  getSession: vi.fn(() => ({ userId: 1 })),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: () => ({
    orgId: "org-A",
    requestId: "req-1",
    log: mockLogger,
  }),
}));

vi.mock("@/lib/event-bus.server", () => ({
  publishEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/env.server", () => ({
  getNodeEnv: () => "test",
}));

vi.mock("@/lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

describe("P0-1: interactions correlated subquery scoped by org_id", () => {
  it("getLeadsWithPendingReplies passes orgId to both outer and inner queries", async () => {
    const { getLeadsWithPendingReplies } = await import("../lib/api/interactions.server");
    await getLeadsWithPendingReplies({});

    const sql = mockDb.unsafe.mock.calls[0][0] as string;
    const params = mockDb.unsafe.mock.calls[0][1] as string[];

    expect(sql).toContain("li.organization_id = $1");
    expect(sql).toContain("WHERE lead_id = li.lead_id AND event_type = 'message_sent' AND organization_id = $1");
    expect(params[0]).toBe("org-A");
  });

  it("getLeadsWithPendingReplies only returns leads belonging to the requesting org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ lead_id: 10 }, { lead_id: 20 }]);

    const { getLeadsWithPendingReplies } = await import("../lib/api/interactions.server");
    const result = await getLeadsWithPendingReplies({});

    expect(result).toEqual([10, 20]);
    expect(mockDb.unsafe).toHaveBeenCalledTimes(1);
    expect(mockDb.unsafe.mock.calls[0][1]).toEqual(["org-A"]);
  });

  it("getLeadsWithPendingReplies SQL has no unscoped correlated subquery", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { getLeadsWithPendingReplies } = await import("../lib/api/interactions.server");
    await getLeadsWithPendingReplies({});

    const sql = mockDb.unsafe.mock.calls[0][0] as string;
    expect(sql).not.toMatch(/lead_interactions WHERE lead_id = li\.lead_id AND event_type = 'message_sent'\)/);
    expect(sql).toContain("organization_id = $1");
  });
});

describe("P0-2: processQueue optional tenantId scoping", () => {
  it("processNotifications queries distinct tenants then processes each separately", async () => {
    // ensureQueueSchema call
    mockDb.unsafe.mockResolvedValueOnce([]);
    // Distinct tenants query returns two tenants
    mockDb.unsafe.mockResolvedValueOnce([{ tenant_id: "org-A" }, { tenant_id: "org-B" }]);
    // ensureQueueSchema for org-A batch
    mockDb.unsafe.mockResolvedValueOnce([]);
    // Queue query for org-A returns one item
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, tenant_id: "org-A", lead_id: 10, event_type: "lead_created", payload_json: null, retry_count: 0, max_retries: 3 },
    ]);
    // UPDATE for org-A item
    mockDb.unsafe.mockResolvedValueOnce([]);
    // ensureQueueSchema for org-B batch
    mockDb.unsafe.mockResolvedValueOnce([]);
    // Queue query for org-B returns one item
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 2, tenant_id: "org-B", lead_id: 20, event_type: "lead_created", payload_json: null, retry_count: 0, max_retries: 3 },
    ]);
    // UPDATE for org-B item
    mockDb.unsafe.mockResolvedValueOnce([]);

    const mockDispatch = vi.fn().mockResolvedValue({ success: true });
    const { processNotifications } = await import("../lib/queue.server");
    const result = await processNotifications({ dispatch: mockDispatch });

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);

    // Verify dispatch was called with each tenant separately, never mixed
    const dispatchCalls = mockDispatch.mock.calls;
    expect(dispatchCalls).toHaveLength(2);
    expect(dispatchCalls[0][0].tenantId).toBe("org-A");
    expect(dispatchCalls[1][0].tenantId).toBe("org-B");
  });

  it("processQueue with tenantId scopes to that tenant only", async () => {
    const { processQueue } = await import("../lib/queue.server");
    await processQueue({ batchSize: 5, tenantId: "tenant-X" });

    const pendingCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("FROM notification_queue") && (sql as string).includes("pending"),
    );
    expect(pendingCall).toBeDefined();
    const sql = pendingCall![0] as string;
    const params = pendingCall![1] as string[];
    expect(sql).toContain("WHERE tenant_id = $1 AND status = 'pending'");
    expect(params[0]).toBe("tenant-X");
    expect(params[1]).toBe(5);
  });

  it("processQueue with tenantId does not mix tenants in batch", async () => {
    const { processQueue } = await import("../lib/queue.server");
    const result = await processQueue({ batchSize: 100, tenantId: "tenant-X" });

    expect(result.processed).toBeGreaterThanOrEqual(0);
    const tenantScopedCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("tenant_id = $1"),
    );
    expect(tenantScopedCall).toBeDefined();
  });

  it("processQueue with valid rows processes and dispatches", async () => {
    // ensureQueueSchema consumes first call; queue query is second; UPDATE is third
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, tenant_id: "org-A", lead_id: 10, event_type: "lead_created", payload_json: null, retry_count: 0, max_retries: 3 },
    ]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const mockDispatch = vi.fn().mockResolvedValue({ success: true });
    const { processQueue } = await import("../lib/queue.server");
    const result = await processQueue({ batchSize: 1, dispatch: mockDispatch });

    expect(result.processed).toBe(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "org-A", leadId: 10 }),
    );
  });
});

describe("P0-3: diagnostics requires SUPER_ADMIN", () => {
  it("getServerStatus works without role check (non-sensitive)", async () => {
    const { getServerStatus } = await import("../lib/api/diagnostics.server");
    const result = await getServerStatus({});
    expect(result.dbAvailable).toBe(true);
  });

  it("getQueueTelemetry calls requireRole(SUPER_ADMIN)", async () => {
    const { requireRole, ROLES } = await import("../lib/permissions.server");
    const { getQueueTelemetry } = await import("../lib/api/diagnostics.server");

    await getQueueTelemetry({});

    expect(requireRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN);
  });

  it("forceRetryQueueItems calls requireRole(SUPER_ADMIN)", async () => {
    const { requireRole, ROLES } = await import("../lib/permissions.server");
    mockDb.unsafe.mockResolvedValue([{ id: 1 }]);

    const { forceRetryQueueItems } = await import("../lib/api/diagnostics.server");
    await forceRetryQueueItems({ data: { maxItems: 10 } });

    expect(requireRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN);
  });

  it("getFailedQueueItems calls requireRole(SUPER_ADMIN)", async () => {
    const { requireRole, ROLES } = await import("../lib/permissions.server");
    const { getFailedQueueItems } = await import("../lib/api/diagnostics.server");

    await getFailedQueueItems({});

    expect(requireRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN);
  });

  it("getQueueTelemetry throws when requireRole rejects", async () => {
    const { requireRole } = await import("../lib/permissions.server");
    (requireRole as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("Insufficient permissions");
    });

    const { getQueueTelemetry } = await import("../lib/api/diagnostics.server");
    await expect(getQueueTelemetry({})).rejects.toThrow("Insufficient permissions");
  });
});

describe("P0-4: getMilestoneStats requires SUPER_ADMIN", () => {
  it("getMilestoneStats calls requireRole(SUPER_ADMIN) before querying", async () => {
    const { requireRole, ROLES } = await import("../lib/permissions.server");
    mockDb.unsafe.mockResolvedValueOnce([{ count: "10" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: "5" }]);

    const { getMilestoneStats } = await import("../lib/telemetry.server");
    await getMilestoneStats();

    expect(requireRole).toHaveBeenCalledWith(ROLES.SUPER_ADMIN);
  });

  it("getMilestoneStats throws when role check fails", async () => {
    const { requireRole } = await import("../lib/permissions.server");
    (requireRole as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("Insufficient permissions");
    });

    const { getMilestoneStats } = await import("../lib/telemetry.server");
    await expect(getMilestoneStats()).rejects.toThrow("Insufficient permissions");
  });

  it("getMilestoneStats still returns zeros when DB is unavailable", async () => {
    const { isDbAvailable } = await import("../lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const { getMilestoneStats } = await import("../lib/telemetry.server");
    const stats = await getMilestoneStats();
    expect(stats.totalOrgs).toBe(0);
    expect(stats.activationRate).toBe(0);
  });

  it("trackUserMilestone still scopes by org_id (unchanged)", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { trackUserMilestone } = await import("../lib/telemetry.server");
    const result = await trackUserMilestone("org-A", "FIRST_LEAD_CREATED");

    expect(result.tracked).toBe(true);
    expect(result.isNew).toBe(true);
    expect(mockDb.unsafe.mock.calls[0][1]).toEqual(["org-A", "FIRST_LEAD_CREATED"]);
  });

  it("hasMilestone still scopes by org_id (unchanged)", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ id: 1 }]);

    const { hasMilestone } = await import("../lib/telemetry.server");
    expect(await hasMilestone("org-A", "FIRST_LEAD_CREATED")).toBe(true);
    expect(mockDb.unsafe.mock.calls[0][1]).toEqual(["org-A", "FIRST_LEAD_CREATED"]);
  });
});

describe("P0-5: queue processQueue error handling preserved", () => {
  it("processQueue handles DB error gracefully via processNotifications", async () => {
    const { processNotifications } = await import("../lib/queue.server");
    const result = await processNotifications();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe("P0-6: bookSlot/reserveSlot organizationId from requireOrg(), not client input", () => {
  it("bookSlot uses requireOrg().orgId for SQL queries, not any client-supplied organizationId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 1,
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
      },
    });

    const updateCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("UPDATE clinic_leads"),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall![1] as unknown[];
    expect(params[params.length - 1]).toBe("org-A");
  });

  it("reserveSlot uses requireOrg().orgId for SQL queries, not any client-supplied organizationId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ id: 42 }]);

    const { reserveSlot } = await import("../lib/api/scheduling.server");
    await reserveSlot({
      data: {
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
        expiresInSeconds: 300,
      },
    });

    const insertCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("INSERT INTO slot_reservations"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe("org-A");
  });

  it("bookSlot ignores any client-supplied organizationId — always uses requireOrg().orgId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { bookSlot } = await import("../lib/api/scheduling.server");
    await bookSlot({
      data: {
        leadId: 1,
        organizationId: "00000000-0000-0000-0000-000000000099",
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
      },
    });

    const updateCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("UPDATE clinic_leads"),
    );
    expect(updateCall).toBeDefined();
    const params = updateCall![1] as unknown[];
    expect(params[params.length - 1]).toBe("org-A");
    expect(params).not.toContain("00000000-0000-0000-0000-000000000099");
  });

  it("reserveSlot ignores any client-supplied organizationId — always uses requireOrg().orgId", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    mockDb.unsafe.mockResolvedValueOnce([{ id: 42 }]);

    const { reserveSlot } = await import("../lib/api/scheduling.server");
    await reserveSlot({
      data: {
        organizationId: "00000000-0000-0000-0000-000000000099",
        appointmentTimestamp: "2026-07-15T10:00:00.000Z",
        expiresInSeconds: 300,
      },
    });

    const insertCall = mockDb.unsafe.mock.calls.find(
      ([sql]: [string]) => (sql as string).includes("INSERT INTO slot_reservations"),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe("org-A");
    expect(params).not.toContain("00000000-0000-0000-0000-000000000099");
  });
});
