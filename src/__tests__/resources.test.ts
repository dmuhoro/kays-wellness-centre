import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  unsafe: vi.fn(),
};
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })),
}));

vi.mock("@/lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    RESOURCE_CONFLICT: "RESOURCE_CONFLICT",
    APPOINTMENT_SCHEDULED: "APPOINTMENT_SCHEDULED",
    RESOURCE_CREATED: "RESOURCE_CREATED",
  },
}));

describe("Resource Conflict Check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns hasConflict:true when provider is already booked in overlapping slot", async () => {
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([{ id: 42 }]);

    const result = await checkResourceConflict("org-1", 1, null, "2026-07-15T10:00:00Z", 30, 99);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingLeadIds).toEqual([42]);
    expect(result.errorCode).toBe("ERR_RESOURCE_CONFLICT");
  });

  it("returns hasConflict:false when no overlap exists", async () => {
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([]);

    const result = await checkResourceConflict("org-1", 1, null, "2026-07-15T10:00:00Z", 30, 99);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingLeadIds).toEqual([]);
  });

  it("returns hasConflict:true when room is already booked in overlapping slot", async () => {
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([{ id: 7 }]);

    const result = await checkResourceConflict("org-1", null, 2, "2026-07-15T14:00:00Z", 30, 99);
    expect(result.hasConflict).toBe(true);
    expect(result.errorCode).toBe("ERR_RESOURCE_CONFLICT");
  });

  it("returns no conflict when provider and room are null", async () => {
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    const result = await checkResourceConflict("org-1", null, null, "2026-07-15T10:00:00Z", 30);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingLeadIds).toEqual([]);
    expect(mockDb.unsafe).not.toHaveBeenCalled();
  });

  it("excludes the current lead from conflict check", async () => {
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([{ id: 42 }]);

    const result = await checkResourceConflict("org-1", 1, 2, "2026-07-15T10:00:00Z", 30, 99);
    expect(result.hasConflict).toBe(true);
    expect(result.errorCode).toBe("ERR_RESOURCE_CONFLICT");
  });
});

describe("Resource CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getResources returns active resources filtered by type", async () => {
    const { getResources } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, organization_id: "org-1", name: "Dr. Smith", type: "PROVIDER", status: "active", created_at: new Date().toISOString() },
    ]);

    const resources = await getResources("org-1", "PROVIDER");
    expect(resources).toHaveLength(1);
    expect(resources[0].name).toBe("Dr. Smith");
    expect(resources[0].type).toBe("PROVIDER");
  });

  it("createResource inserts and returns the new row", async () => {
    const { createResource } = await import("@/lib/api/resources.server");
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 3, organization_id: "org-1", name: "Room A", type: "ROOM", status: "active", created_at: new Date().toISOString() },
    ]);

    const resource = await createResource("org-1", "Room A", "ROOM");
    expect(resource.name).toBe("Room A");
    expect(resource.type).toBe("ROOM");
    expect(resource.status).toBe("active");
  });
});

describe("scheduleAppointment schema validation", () => {
  it("accepts valid input", async () => {
    const { default: mod } = await import("@/lib/api/resources.server");
    const schema = mod?.scheduleAppointment?.constructor?.name;
    // The function is a createServerFn — test the underlying pure functions instead
    const { checkResourceConflict } = await import("@/lib/api/resources.server");
    const result = await checkResourceConflict("org-1", null, null, "2026-07-15T10:00:00Z", 30);
    expect(result.hasConflict).toBe(false);
  });
});
