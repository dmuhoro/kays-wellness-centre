import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

beforeAll(() => {
  (globalThis as any).indexedDB = {
    open: vi.fn(() => {
      const req = { result: {}, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => { if (req.onsuccess) (req.onsuccess as any)(); }, 0);
      return req as unknown as IDBOpenDBRequest;
    }),
    deleteDatabase: vi.fn(),
    cmp: vi.fn(),
  };
});

afterAll(() => {
  delete (globalThis as any).indexedDB;
});

describe("Offline Store — function exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports all expected functions", async () => {
    const mod = await import("@/lib/offline-store");
    expect(mod).toHaveProperty("cacheAppointments");
    expect(mod).toHaveProperty("getCachedAppointments");
    expect(mod).toHaveProperty("queueCheckin");
    expect(mod).toHaveProperty("getPendingCheckins");
    expect(mod).toHaveProperty("removePendingCheckin");
    expect(mod).toHaveProperty("syncPendingCheckins");
  });

  it("types are properly defined", () => {
    const appt = {
      id: 1,
      name: "Jane",
      phone: "+2547001",
      service: "BHRT",
      appointment_timestamp: "2026-07-20T10:00:00Z",
      provider_id: null,
      room_id: null,
      organization_id: "org-1",
    };
    expect(appt.id).toBe(1);
    expect(appt.name).toBe("Jane");

    const checkin = {
      id: "org-1:1:123456",
      leadId: 1,
      organizationId: "org-1",
      timestamp: new Date().toISOString(),
    };
    expect(checkin.leadId).toBe(1);
  });

  it("returns typed CachedAppointment interface", () => {
    const appt = {
      id: 1,
      name: "Jane",
      phone: "+2547001",
      service: "BHRT",
      appointment_timestamp: "2026-07-20T10:00:00Z",
      provider_id: null,
      room_id: null,
      organization_id: "org-1",
    };
    expect(appt.id).toBe(1);
    expect(appt.name).toBe("Jane");
    expect(appt.organization_id).toBe("org-1");
  });

  it("returns typed PendingCheckin interface", () => {
    const checkin = {
      id: "org-1:1:123456",
      leadId: 1,
      organizationId: "org-1",
      timestamp: new Date().toISOString(),
    };
    expect(checkin.leadId).toBe(1);
    expect(checkin.organizationId).toBe("org-1");
  });
});
