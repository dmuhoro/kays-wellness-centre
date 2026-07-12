import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

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
  getDb: vi.fn(() => Promise.resolve({ unsafe: vi.fn(() => Promise.resolve([{ id: 1 }])) })),
  isDbAvailable: vi.fn(() => true),
  ensureSchema: vi.fn(() => true),
  getConcurrentLock: vi.fn(() => Promise.resolve(true)),
  releaseConcurrentLock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1", log: mockLogger })),
}));

vi.mock("@/lib/session.server", () => ({
  getSession: vi.fn(() => ({ userId: 1 })),
  getCurrentUserRole: vi.fn(() => "staff"),
}));

vi.mock("@/lib/rate-limit.server", () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock("@/lib/queue.server", () => ({
  enqueueNotification: vi.fn(() => Promise.resolve({ id: 1, status: "queued" })),
  processNotifications: vi.fn(() => Promise.resolve({ processed: 0, failed: 0 })),
}));

vi.mock("@/lib/audit.server", () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/analytics.server", () => ({ computeAnalytics: vi.fn(() => Promise.resolve({})) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("RBAC completeness", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("saveClinicConfig returns forbidden for staff", async () => {
    const { saveClinicConfig } = await import("@/lib/api/clinic-config.server");
    const result = await saveClinicConfig({ data: {} });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("updateLead allows staff access", async () => {
    const { updateLead } = await import("@/lib/api/leads.server");
    const result = await updateLead({ data: { id: 1 } });
    expect(result).not.toHaveProperty("status", "forbidden");
  });

  it("bookSlot allows staff access", async () => {
    const { bookSlot } = await import("@/lib/api/scheduling.server");
    const result = await bookSlot({ data: { leadId: 1, appointmentTimestamp: "2026-07-15T10:00:00.000Z" } });
    expect(result).not.toHaveProperty("status", "forbidden");
  });

  it("reserveSlot allows staff access", async () => {
    const { reserveSlot } = await import("@/lib/api/scheduling.server");
    const result = await reserveSlot({ data: { appointmentTimestamp: "2026-07-15T10:00:00.000Z", expiresInSeconds: 300 } });
    expect(result).not.toHaveProperty("status", "forbidden");
  });

  it("scheduleAppointment allows staff access", async () => {
    const { scheduleAppointment } = await import("@/lib/api/resources.server");
    const result = await scheduleAppointment({ data: { leadId: 1, appointmentTimestamp: "2026-07-15T10:00:00.000Z" } });
    expect(result).not.toHaveProperty("status", "forbidden");
  });

  it("createResourceFn returns forbidden for staff", async () => {
    const { createResourceFn } = await import("@/lib/api/resources.server");
    const result = await createResourceFn({ data: { name: "Test", type: "PROVIDER" } });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("bulkImportLeads returns forbidden for staff", async () => {
    const { bulkImportLeads } = await import("@/lib/import.server");
    const result = await bulkImportLeads({ data: { rows: [] } });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("triggerAutomation returns forbidden for staff", async () => {
    const { triggerAutomation } = await import("@/lib/api/automation.server");
    const result = await triggerAutomation({ data: {} });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("dispatchLeadMessage allows staff access", async () => {
    const { dispatchLeadMessage } = await import("@/lib/api/dispatch.server");
    const result = await dispatchLeadMessage({ data: { leadId: 1, messageType: "confirmation" } });
    expect(result).not.toHaveProperty("status", "forbidden");
  });

  it("triggerQueueProcessing returns forbidden for staff", async () => {
    const { triggerQueueProcessing } = await import("@/lib/api/notifications.server");
    const result = await triggerQueueProcessing({ data: {} });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("getAnalytics returns forbidden for staff", async () => {
    const { getAnalytics } = await import("@/lib/api/analytics.server");
    const result = await getAnalytics({ data: {} });
    expect(result).toHaveProperty("status", "forbidden");
  });

  it("fetchPayments returns forbidden for staff", async () => {
    const { fetchPayments } = await import("@/lib/api/billing.server");
    const result = await fetchPayments({ data: { invoiceId: 1 } });
    expect(result).toHaveProperty("status", "forbidden");
  });
});
