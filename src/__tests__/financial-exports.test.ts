import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));
vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({
    orgId: "org-1",
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) },
  })),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: { DATA_EXPORT: "DATA_EXPORT" },
}));

const sampleRecords = [
  {
    id: 1, invoice_number: "INV-2026-00001", lead_name: "John Doe", lead_email: "john@test.com",
    total_amount: 5000, currency: "KES", tax_amount: 0, status: "paid",
    issued_at: "2026-07-01T10:00:00Z", paid_at: "2026-07-05T10:00:00Z", due_at: "2026-07-15T10:00:00Z",
    payment_method: "cash", receipt_number: "KWC-2026-00001", notes: "Consultation fee",
  },
  {
    id: 2, invoice_number: "INV-2026-00002", lead_name: "Jane Smith", lead_email: "jane@test.com",
    total_amount: 12000, currency: "KES", tax_amount: 1200, status: "issued",
    issued_at: "2026-07-05T10:00:00Z", paid_at: null, due_at: "2026-07-20T10:00:00Z",
    payment_method: null, receipt_number: null, notes: null,
  },
];

describe("Currency Conversion", () => {
  it("converts KES to USD", async () => {
    const { convertCurrency } = await import("@/lib/financial-exports.server");
    const result = convertCurrency(1000, "KES", "USD");
    expect(result).toBe(7.7);
  });

  it("KES to KES returns same amount", async () => {
    const { convertCurrency } = await import("@/lib/financial-exports.server");
    expect(convertCurrency(5000, "KES", "KES")).toBe(5000);
  });

  it("converts USD to KES", async () => {
    const { convertCurrency } = await import("@/lib/financial-exports.server");
    const result = convertCurrency(1, "USD", "KES");
    expect(result).toBe(129.87);
  });

  it("handles zero amount", async () => {
    const { convertCurrency } = await import("@/lib/financial-exports.server");
    expect(convertCurrency(0, "KES", "USD")).toBe(0);
  });
});

describe("QuickBooks Mapper", () => {
  it("maps records to QuickBooks format", async () => {
    const { mapToQuickBooks } = await import("@/lib/financial-exports.server");
    const qb = mapToQuickBooks(sampleRecords, "KES");
    expect(qb).toHaveLength(2);
    expect(qb[0].DocNumber).toBe("INV-2026-00001");
    expect(qb[0].CustomerRef.name).toBe("John Doe");
    expect(qb[0].TotalAmt).toBe(5000);
    expect(qb[0].CurrencyRef.value).toBe("KES");
    expect(qb[0].Balance).toBe(0); // Paid
  });

  it("sets Balance to TotalAmt for unpaid invoices", async () => {
    const { mapToQuickBooks } = await import("@/lib/financial-exports.server");
    const qb = mapToQuickBooks(sampleRecords);
    expect(qb[1].Balance).toBe(12000); // Unpaid
  });

  it("includes TxnTaxDetail when tax > 0", async () => {
    const { mapToQuickBooks } = await import("@/lib/financial-exports.server");
    const qb = mapToQuickBooks(sampleRecords);
    expect(qb[0].TxnTaxDetail).toBeUndefined(); // No tax
    expect(qb[1].TxnTaxDetail).toBeDefined();
    expect(qb[1].TxnTaxDetail?.TotalTax).toBe(1200);
  });
});

describe("Xero Mapper", () => {
  it("maps records to Xero format", async () => {
    const { mapToXero } = await import("@/lib/financial-exports.server");
    const xero = mapToXero(sampleRecords, "KES");
    expect(xero).toHaveLength(2);
    expect(xero[0].InvoiceNumber).toBe("INV-2026-00001");
    expect(xero[0].Contact.Name).toBe("John Doe");
    expect(xero[0].Contact.EmailAddress).toBe("john@test.com");
    expect(xero[0].CurrencyCode).toBe("KES");
  });

  it("maps status correctly for paid invoices", async () => {
    const { mapToXero } = await import("@/lib/financial-exports.server");
    const xero = mapToXero(sampleRecords);
    expect(xero[0].Status).toBe("PAID");
    expect(xero[0].AmountDue).toBe(0);
  });

  it("maps status correctly for issued invoices", async () => {
    const { mapToXero } = await import("@/lib/financial-exports.server");
    const xero = mapToXero(sampleRecords);
    expect(xero[1].Status).toBe("AUTHORISED");
    expect(xero[1].AmountDue).toBe(12000);
  });

  it("maps void status to VOIDED", async () => {
    const { mapToXero } = await import("@/lib/financial-exports.server");
    const voidRecord = [{ ...sampleRecords[0], status: "void" }];
    const xero = mapToXero(voidRecord);
    expect(xero[0].Status).toBe("VOIDED");
  });

  it("includes tax info when present", async () => {
    const { mapToXero } = await import("@/lib/financial-exports.server");
    const xero = mapToXero(sampleRecords);
    expect(xero[1].LineItems[0].TaxType).toBe("OUTPUT");
    expect(xero[0].LineItems[0].TaxType).toBe("NONE");
  });
});

describe("CSV Export Functions", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("exportQuickBooksCsv produces CSV with headers", async () => {
    const { exportQuickBooksCsv } = await import("@/lib/financial-exports.server");
    const csv = exportQuickBooksCsv(sampleRecords);
    expect(csv).toContain("TxnDate");
    expect(csv).toContain("DocNumber");
    expect(csv).toContain("TotalAmt");
    const lines = csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 rows
  });

  it("exportXeroCsv produces CSV with Xero headers", async () => {
    const { exportXeroCsv } = await import("@/lib/financial-exports.server");
    const csv = exportXeroCsv(sampleRecords);
    expect(csv).toContain("InvoiceNumber");
    expect(csv).toContain("Contact.Name");
    expect(csv).toContain("LineItems.0.Description");
  });

  it("exportFinancialJson produces valid QuickBooks JSON", async () => {
    const { exportFinancialJson } = await import("@/lib/financial-exports.server");
    const json = exportFinancialJson(sampleRecords, "quickbooks");
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].DocNumber).toBe("INV-2026-00001");
  });

  it("exportFinancialJson produces valid Xero JSON", async () => {
    const { exportFinancialJson } = await import("@/lib/financial-exports.server");
    const json = exportFinancialJson(sampleRecords, "xero");
    const parsed = JSON.parse(json);
    expect(parsed[0].InvoiceNumber).toBe("INV-2026-00001");
    expect(parsed[0].Contact.Name).toBe("John Doe");
  });
});
