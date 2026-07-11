import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  unsafe: vi.fn(),
};
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
  getConcurrentLock: vi.fn(),
  releaseConcurrentLock: vi.fn(),
}));

const mockSession = vi.fn();
vi.mock("@/lib/session.server", () => ({
  getSession: () => mockSession(),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    INVOICE_GENERATED: "INVOICE_GENERATED",
    INVOICE_PAID: "INVOICE_PAID",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  },
}));

vi.mock("@/lib/audit.server", () => ({
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/event-bus.server", () => ({
  publishEvent: vi.fn(() => Promise.resolve()),
}));

describe("generateInvoice with concurrency lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
    mockSession.mockReturnValue({ userId: 1, orgId: "org-1", role: "admin", exp: Date.now() + 3600000 });
  });

  it("throws when lock cannot be acquired", async () => {
    const lockModule = await import("@/lib/db.server");
    vi.mocked(lockModule.getConcurrentLock).mockResolvedValue(false);

    const { generateInvoice } = await import("@/lib/api/billing.server");
    await expect(generateInvoice("org-1", 1, 2500)).rejects.toThrow(
      "Could not acquire lock for invoice generation",
    );
  });

  it("acquires lock before generating invoice number", async () => {
    const lockModule = await import("@/lib/db.server");
    vi.mocked(lockModule.getConcurrentLock).mockResolvedValue(true);

    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 2500, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }]);

    const { generateInvoice } = await import("@/lib/api/billing.server");
    await generateInvoice("org-1", 1, 2500);

    expect(lockModule.getConcurrentLock).toHaveBeenCalledWith("invoice_seq:org-1");
    expect(lockModule.releaseConcurrentLock).toHaveBeenCalledWith("invoice_seq:org-1");
  });
});

describe("recordPayment with concurrency lock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("acquires lock before recording payment", async () => {
    const lockModule = await import("@/lib/db.server");
    vi.mocked(lockModule.getConcurrentLock).mockResolvedValue(true);

    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 5000, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, invoice_id: 1, organization_id: "org-1",
        amount: 2500, method: "cash", receipt_number: "KWC-2026-00001",
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{ total: 2500 }]);

    const { recordPayment } = await import("@/lib/api/billing.server");
    await recordPayment("org-1", 1, 2500, "cash");

    expect(lockModule.getConcurrentLock).toHaveBeenCalledWith("payment:org-1:1");
    expect(lockModule.releaseConcurrentLock).toHaveBeenCalledWith("payment:org-1:1");
  });

  it("throws when invoice is already paid", async () => {
    const lockModule = await import("@/lib/db.server");
    vi.mocked(lockModule.getConcurrentLock).mockResolvedValue(true);

    mockDb.unsafe.mockResolvedValueOnce([{
      id: 1, lead_id: 1, organization_id: "org-1",
      invoice_number: "INV-2026-00001", total_amount: 2500, status: "paid",
      issued_at: new Date().toISOString(), paid_at: new Date().toISOString(), due_at: null,
      notes: null, created_at: new Date().toISOString(),
    }]);

    const { recordPayment } = await import("@/lib/api/billing.server");
    await expect(recordPayment("org-1", 1, 500, "cash")).rejects.toThrow(
      "Invoice is already fully paid",
    );
  });

  it("throws when lock cannot be acquired", async () => {
    const lockModule = await import("@/lib/db.server");
    vi.mocked(lockModule.getConcurrentLock).mockResolvedValue(false);

    const { recordPayment } = await import("@/lib/api/billing.server");
    await expect(recordPayment("org-1", 1, 500, "cash")).rejects.toThrow(
      "Could not acquire lock for payment recording",
    );
  });
});
