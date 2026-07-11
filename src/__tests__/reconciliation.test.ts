import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
  getConcurrentLock: vi.fn(() => Promise.resolve(true)),
  releaseConcurrentLock: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1" })),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    RECONCILIATION_MATCH: "RECONCILIATION_MATCH",
    RECONCILIATION_NO_MATCH: "RECONCILIATION_NO_MATCH",
    RECONCILIATION_AUTO_PAID: "RECONCILIATION_AUTO_PAID",
    INVOICE_GENERATED: "INVOICE_GENERATED",
    INVOICE_PAID: "INVOICE_PAID",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  },
}));
vi.mock("@/lib/audit.server", () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/session.server", () => ({ getSession: vi.fn(() => ({ userId: 1 })) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("M-Pesa Message Parsing", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("parses standard M-Pesa confirmation with Safaricom ref", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment(
      "Safaricom: SBI12345678901 Confirmed. KES 2,500.00 sent to John Doe on 7/10/26. New M-Pesa balance: KES 12,000.00. Account number: 254712345678"
    );
    expect(result.reference).toBe("SBI12345678901");
    expect(result.amount).toBe(2500);
    expect(result.phone).toBe("254712345678");
    expect(result.provider).toBe("mpesa");
  });

  it("parses M-Pesa message with Q-prefixed ref", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment(
      "QAB1C2D3E4F5 Confirmed KES 5,000 from 254798765432"
    );
    expect(result.reference).toMatch(/^Q/);
    expect(result.amount).toBe(5000);
    expect(result.phone).toBe("254798765432");
    expect(result.provider).toBe("mpesa");
  });

  it("handles Ksh currency prefix", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("Ksh 1,250.50 paid via M-Pesa ref SBI9998887776");
    expect(result.amount).toBe(1250.5);
    expect(result.reference).toBe("SBI9998887776");
  });

  it("handles amount without decimals", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("KES 3000 confirmed. Ref SBI1112223334");
    expect(result.amount).toBe(3000);
  });
});

describe("Bank Message Parsing", () => {
  it("parses bank transaction with REF tag", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment(
      "Bank Alert: KES 15,000 received. REF TXN-2026-001234. Account ending 5678"
    );
    expect(result.reference).toBe("TXN-2026-001234");
    expect(result.amount).toBe(15000);
    expect(result.provider).toBe("bank");
  });

  it("parses bank message with REFERENCE tag", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment(
      "KES 8,500.00 credited. REFERENCE ABC-DEF-12345"
    );
    expect(result.reference).toBe("ABC-DEF-12345");
    expect(result.amount).toBe(8500);
  });
});

describe("Unknown Message Format", () => {
  it("generates fallback ref for unparseable messages", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("Something weird happened");
    expect(result.reference).toMatch(/^REF-\d+$/);
    expect(result.amount).toBe(0);
    expect(result.provider).toBe("unknown");
  });

  it("returns empty phone when none found", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("KES 1000 no phone ref SBI12345678901");
    expect(result.phone).toBeNull();
  });
});

describe("Reconciliation - Single Invoice Match", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("auto-pays when single invoice matches amount", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ id: 10, lead_id: 5, total_amount: 2500, status: "issued", invoice_number: "INV-2026-00001" }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{ id: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, inbound_reference: "SBI123", status: "auto_paid" }]);

    const { reconcilePayment, parseInboundPayment } = await import("@/lib/reconciliation.server");
    const parsed = parseInboundPayment("SBI12345678 Confirmed KES 2,500.00 254712345678");
    const result = await reconcilePayment("org-1", parsed);

    expect(result.status).toBe("auto_paid");
    expect(result.invoiceId).toBe(10);
    expect(result.paymentId).toBe(20);
  });

  it("returns unmatched when no invoices match", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, status: "unmatched" }]);

    const { reconcilePayment } = await import("@/lib/reconciliation.server");
    const result = await reconcilePayment("org-1", {
      reference: "SBI999",
      amount: 99999,
      phone: null,
      rawMessage: "test",
      provider: "mpesa",
    });

    expect(result.status).toBe("unmatched");
  });
});

describe("Reconciliation - Multi-Invoice with Phone Match", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("matches correct invoice when multiple candidates exist and phone matches", async () => {
    const candidates = [
      { id: 10, lead_id: 5, total_amount: 2500, status: "issued", invoice_number: "INV-2026-00001" },
      { id: 11, lead_id: 6, total_amount: 2500, status: "issued", invoice_number: "INV-2026-00002" },
    ];
    mockDb.unsafe
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([{ phone: "0712345678" }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{ id: 30 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2, inbound_reference: "SBI123", status: "auto_paid" }]);

    const { reconcilePayment } = await import("@/lib/reconciliation.server");
    const result = await reconcilePayment("org-1", {
      reference: "SBI123",
      amount: 2500,
      phone: "0712345678",
      rawMessage: "test",
      provider: "mpesa",
    });

    expect(result.status).toBe("auto_paid");
    expect(result.invoiceId).toBe(10);
  });

  it("falls back to first candidate when phone doesn't match any", async () => {
    const candidates = [
      { id: 10, lead_id: 5, total_amount: 2500, status: "issued", invoice_number: "INV-2026-00001" },
    ];
    mockDb.unsafe
      .mockResolvedValueOnce(candidates)
      .mockResolvedValueOnce([{ phone: "0799999999" }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{ id: 30 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2, status: "auto_paid" }]);

    const { reconcilePayment } = await import("@/lib/reconciliation.server");
    const result = await reconcilePayment("org-1", {
      reference: "SBI123",
      amount: 2500,
      phone: "0700000000",
      rawMessage: "test",
      provider: "mpesa",
    });

    expect(result.status).toBe("auto_paid");
  });
});

describe("Reconciliation Log Retrieval", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("fetches reconciliation log for org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, status: "auto_paid", inbound_reference: "SBI123" },
      { id: 2, status: "unmatched", inbound_reference: "SBI456" },
    ]);

    const { getReconciliationLog } = await import("@/lib/reconciliation.server");
    const log = await getReconciliationLog("org-1", 10);

    expect(log).toHaveLength(2);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("reconciliation_log"),
      ["org-1", 10],
    );
  });
});

describe("Process Inbound Payment Message", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("parses and reconciles in one step", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ id: 10, lead_id: 5, total_amount: 2500, status: "issued", invoice_number: "INV-2026-00001" }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{ id: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 1, status: "auto_paid" }]);

    const { processInboundPaymentMessage } = await import("@/lib/reconciliation.server");
    const result = await processInboundPaymentMessage(
      "org-1",
      "SBI12345678 Confirmed KES 2,500.00 254712345678",
    );

    expect(result.status).toBe("auto_paid");
    expect(result.invoiceId).toBe(10);
  });
});

describe("Phone Normalization", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("converts 0-prefixed to 254 prefix", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("KES 1000 0712345678 ref SBI12345678901");
    expect(result.phone).toBe("0712345678");
  });

  it("keeps 254 prefix as-is", async () => {
    const { parseInboundPayment } = await import("@/lib/reconciliation.server");
    const result = parseInboundPayment("KES 1000 254712345678 ref SBI12345678901");
    expect(result.phone).toBe("254712345678");
  });
});
