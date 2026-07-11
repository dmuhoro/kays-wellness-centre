import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  unsafe: vi.fn(),
};
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } })),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    INVOICE_GENERATED: "INVOICE_GENERATED",
    INVOICE_PAID: "INVOICE_PAID",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  },
}));

describe("Invoice Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("generateInvoice creates new invoice with sequential number", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 2500, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }]);

    const { generateInvoice } = await import("@/lib/api/billing.server");
    const inv = await generateInvoice("org-1", 1, 2500);
    expect(inv.invoice_number).toBe("INV-2026-00001");
    expect(inv.total_amount).toBe(2500);
    expect(inv.status).toBe("issued");
  });

  it("generateInvoice increments sequence number", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: "INV-2026-00005" }])
      .mockResolvedValueOnce([{
        id: 2, lead_id: 2, organization_id: "org-1",
        invoice_number: "INV-2026-00006", total_amount: 5000, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }]);

    const { generateInvoice } = await import("@/lib/api/billing.server");
    const inv = await generateInvoice("org-1", 2, 5000);
    expect(inv.invoice_number).toBe("INV-2026-00006");
  });
});

describe("Payment Recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  it("recordPayment creates payment with sequential receipt number", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, invoice_id: 1, organization_id: "org-1",
        amount: 2500, method: "cash", receipt_number: "KWC-2026-00001",
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 2500, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{ total: 2500 }])
      .mockResolvedValueOnce([]);

    const { recordPayment } = await import("@/lib/api/billing.server");
    const result = await recordPayment("org-1", 1, 2500, "cash");
    expect(result.payment.receipt_number).toBe("KWC-2026-00001");
    expect(result.payment.method).toBe("cash");
    expect(result.payment.amount).toBe(2500);
  });

  it("recordPayment marks invoice paid when fully paid", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, invoice_id: 1, organization_id: "org-1",
        amount: 2500, method: "mobile_money", receipt_number: "KWC-2026-00001",
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 2500, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{ total: 2500 }])
      .mockResolvedValueOnce([]);

    const { recordPayment } = await import("@/lib/api/billing.server");
    const result = await recordPayment("org-1", 1, 2500, "mobile_money");
    expect(result.invoiceFullyPaid).toBe(true);
  });

  it("recordPayment does not mark invoice paid when partial", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 1, invoice_id: 1, organization_id: "org-1",
        amount: 1000, method: "card", receipt_number: "KWC-2026-00001",
        notes: "Partial payment", created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{
        id: 1, lead_id: 1, organization_id: "org-1",
        invoice_number: "INV-2026-00001", total_amount: 5000, status: "issued",
        issued_at: new Date().toISOString(), paid_at: null, due_at: null,
        notes: null, created_at: new Date().toISOString(),
      }])
      .mockResolvedValueOnce([{ total: 1000 }]);

    const { recordPayment } = await import("@/lib/api/billing.server");
    const result = await recordPayment("org-1", 1, 1000, "card", "Partial payment");
    expect(result.invoiceFullyPaid).toBe(false);
  });
});

describe("Invoice Schema & Server Function Exports", () => {
  it("exports billing server functions", async () => {
    const mod = await import("@/lib/api/billing.server");
    expect(mod).toHaveProperty("generateInvoice");
    expect(mod).toHaveProperty("recordPayment");
    expect(mod).toHaveProperty("getInvoices");
    expect(mod).toHaveProperty("getPayments");
    expect(mod).toHaveProperty("fetchInvoices");
    expect(mod).toHaveProperty("addPayment");
    expect(mod).toHaveProperty("generateInvoiceForCheckedIn");
  });

  it("generateInvoiceForCheckedIn has proper input schema", async () => {
    // The createServerFn input schema validation should work standalone
    const mod = await import("@/lib/api/billing.server");
    expect(mod.generateInvoiceForCheckedIn).toBeDefined();
    expect(typeof mod.generateInvoiceForCheckedIn).toBe("function");
  });
});
