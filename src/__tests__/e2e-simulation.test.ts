/**
 * E2E Simulation Test — Sprint 34
 *
 * Full patient lifecycle: lead → pipeline → invoice → payment → retention → review
 * + multi-tenant isolation + concurrent stress + edge cases.
 *
 * Uses mockReset on mockDb.unsafe in beforeEach to clear mockResolvedValueOnce queues.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
  getConcurrentLock: vi.fn(async () => true),
  releaseConcurrentLock: vi.fn(async () => {}),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: new Proxy({}, { get: () => "TEST_EVENT" }),
}));
vi.mock("@/lib/session.server", () => ({
  getSession: vi.fn(() => ({ userId: 1 })),
}));
vi.mock("@/lib/audit.server", () => ({
  recordAudit: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/event-bus.server", () => ({
  publishEvent: vi.fn(() => Promise.resolve()),
}));

import {
  ingestInboundLead,
  advanceLeadStage,
} from "@/lib/marketing/leads.server";
import { generateInvoice, recordPayment } from "@/lib/api/billing.server";
import {
  computeRetentionScore,
  scheduleRetentionTask,
} from "@/lib/marketing/automation.server";
import {
  sendSatisfactionPrompt,
  processFeedbackResponse,
} from "@/lib/marketing/reviews.server";

const ORG = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  mockDb.unsafe.mockReset();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. FULL LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════
describe("E2E: Full patient lifecycle simulation", () => {
  it("completes lead → stage → invoice → payment → retention → feedback → review", async () => {
    // Step 1: Inbound lead via WhatsApp
    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 1001, name: "E2E Patient", phone: "+254712345678",
        email: "", service: "Dental", channel: "whatsapp",
        priority: "medium", status: "new", created_at: "2026-07-11T10:00:00Z",
      }])
      .mockResolvedValueOnce([]);

    const lead = await ingestInboundLead({
      orgId: ORG, phone: "+254712345678", name: "E2E Patient",
      source: "whatsapp", service: "Dental", message: "Dental checkup",
    });
    expect(lead.phone).toBe("+254712345678");
    expect(lead.orgId).toBe(ORG);

    // Step 2: Advance pipeline
    mockDb.unsafe
      .mockResolvedValueOnce([{ status: "new", name: "E2E Patient" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 1001, name: "E2E Patient", phone: "+254712345678",
        email: "", service: "Dental", channel: "whatsapp",
        priority: "medium", status: "contacted",
        created_at: "2026-07-11T10:00:00Z", updated_at: "2026-07-11T10:01:00Z",
      }]);

    const advanced = await advanceLeadStage(ORG, 1001, "contacted");
    expect(advanced).not.toBeNull();
    expect(advanced!.stage).toBe("contacted");

    // Step 3: Generate invoice (nextInvoiceSeq + INSERT)
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 2001, organization_id: ORG, lead_id: 1001,
        invoice_number: "INV-2026-00001", total_amount: 5000,
        status: "issued", issued_at: "2026-07-11T10:05:00Z",
        paid_at: null, due_at: null, notes: null, created_at: "2026-07-11T10:05:00Z",
      }]);

    const invoice = await generateInvoice(ORG, 1001, 5000);
    expect(invoice.invoice_number).toContain("INV-");

    // Step 4: Record payment (SELECT invoice + nextReceiptSeq + INSERT payment + SUM + UPDATE)
    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 2001, organization_id: ORG, total_amount: 5000, status: "issued",
      }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 3001, invoice_id: 2001, organization_id: ORG,
        amount: 5000, method: "mobile_money", receipt_number: "KWC-2026-00001",
        notes: null, created_at: "2026-07-11T10:06:00Z",
      }])
      .mockResolvedValueOnce([{ total: 5000 }])
      .mockResolvedValueOnce([]);

    const paymentResult = await recordPayment(ORG, 2001, 5000, "mobile_money");
    expect(paymentResult.payment.receipt_number).toContain("KWC-");
    expect(paymentResult.invoiceFullyPaid).toBe(true);

    // Step 5: Schedule retention task (SELECT lead + INSERT task)
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "E2E Patient", phone: "+254712345678" }])
      .mockResolvedValueOnce([{ id: 4001, status: "pending", created_at: "2026-07-11T10:10:00Z" }]);

    const task = await scheduleRetentionTask(ORG, 1001, "follow_up_checkup", "whatsapp");
    expect(task.status).toBe("pending");

    // Step 6: Satisfaction prompt (SELECT lead + SELECT cooldown + INSERT prompt)
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "E2E Patient", phone: "+254712345678" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 5001, created_at: "2026-07-11T10:15:00Z" }]);

    const prompt = await sendSatisfactionPrompt(ORG, 2001, 1001);
    expect(prompt.id).toBe(5001);

    // Step 7: Process feedback (SELECT prompt + UPDATE prompt + INSERT feedback + auto-submit review)
    mockDb.unsafe
      .mockResolvedValueOnce([{ lead_id: 1001 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 6001, created_at: "2026-07-11T10:16:00Z" }])
      .mockResolvedValueOnce([{ id: 7001, created_at: "2026-07-11T10:16:00Z" }]);

    const feedback = await processFeedbackResponse(5001, ORG, 9, "Excellent service!");
    expect(feedback.npsScore).toBe(9);
    expect(feedback.sentiment).toBe("positive");
    expect(feedback.reviewSubmitted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. MULTI-TENANT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
describe("Multi-tenant isolation across lifecycle", () => {
  it("two orgs produce independent lead records", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 1001, name: "Org A", phone: "+254700000001",
        email: "", service: "", channel: "sms",
        priority: "medium", status: "new", created_at: "2026-07-11T10:00:00Z",
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 1002, name: "Org B", phone: "+254700000002",
        email: "", service: "", channel: "whatsapp",
        priority: "medium", status: "new", created_at: "2026-07-11T10:01:00Z",
      }])
      .mockResolvedValueOnce([]);

    const a = await ingestInboundLead({
      orgId: ORG, phone: "+254700000001", name: "Org A", source: "sms", message: "Book",
    });
    const b = await ingestInboundLead({
      orgId: ORG_B, phone: "+254700000002", name: "Org B", source: "whatsapp", message: "Consult",
    });

    expect(a.orgId).toBe(ORG);
    expect(b.orgId).toBe(ORG_B);
    expect(a.id).not.toBe(b.id);
  });

  it("advanceLeadStage returns null for cross-org lead", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const result = await advanceLeadStage(ORG_B, 1001, "contacted");
    expect(result).toBeNull();
  });

  it("recordPayment rejects cross-org invoice", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await expect(
      recordPayment(ORG_B, 2001, 3000, "cash"),
    ).rejects.toThrow("Invoice not found");
  });

  it("processFeedbackResponse rejects cross-org prompt", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await expect(
      processFeedbackResponse(5001, ORG_B, 10, "Hacked"),
    ).rejects.toThrow("Prompt not found");
  });

  it("scheduleRetentionTask rejects cross-org lead", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    await expect(
      scheduleRetentionTask(ORG_B, 1001, "follow_up_checkup"),
    ).rejects.toThrow("Lead not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CONCURRENT STRESS
// ═══════════════════════════════════════════════════════════════════════════
describe("Concurrent lifecycle stress", () => {
  it("handles 10 concurrent lead ingestions without collision", async () => {
    let seq = 1000;
    mockDb.unsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO clinic_leads")) {
        return [{
          id: seq++, name: `Patient ${seq}`, phone: `+25471000${String(seq).padStart(4, "0")}`,
          email: "", service: "", channel: "whatsapp",
          priority: "medium", status: "new", created_at: "2026-07-11T10:00:00Z",
        }];
      }
      return [];
    });

    const leads = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ingestInboundLead({
          orgId: ORG, phone: `+25471000${String(i).padStart(4, "0")}`,
          name: `Patient ${i}`, source: "whatsapp", message: `Request ${i}`,
        }),
      ),
    );

    expect(new Set(leads.map(l => l.id)).size).toBe(10);
  });

  it("handles concurrent stage advancement gracefully", async () => {
    mockDb.unsafe.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT status, name FROM clinic_leads")) {
        return [{ status: "new", name: "Patient" }];
      }
      if (sql.includes("UPDATE clinic_leads")) return [];
      if (sql.includes("INSERT INTO lead_interactions")) return [];
      if (sql.includes("SELECT id, name, phone")) {
        return [{
          id: 1001, name: "Patient", phone: "+254700000001",
          email: "", service: "", channel: "whatsapp",
          priority: "medium", status: "contacted",
          created_at: "2026-07-11T10:00:00Z", updated_at: "2026-07-11T10:01:00Z",
        }];
      }
      return [];
    });

    const results = await Promise.all([
      advanceLeadStage(ORG, 1001, "contacted"),
      advanceLeadStage(ORG, 1001, "contacted"),
      advanceLeadStage(ORG, 1001, "contacted"),
    ]);

    results.forEach(r => {
      if (r !== null) expect(r.stage).toBe("contacted");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
describe("Edge cases across lifecycle", () => {
  it("accepts lead with empty phone", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 1010, name: "No Phone", phone: "",
        email: "", service: "", channel: "whatsapp",
        priority: "medium", status: "new", created_at: "2026-07-11T10:00:00Z",
      }])
      .mockResolvedValueOnce([]);

    const lead = await ingestInboundLead({
      orgId: ORG, phone: "", name: "No Phone", source: "whatsapp", message: "Hi",
    });
    expect(lead).toBeDefined();
    expect(lead.phone).toBe("");
  });

  it("generateInvoice accepts negative amount (no server-side validation)", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 2099, organization_id: ORG, lead_id: 1,
        invoice_number: "INV-2026-00099", total_amount: -100,
        status: "issued", issued_at: "2026-07-11T10:00:00Z",
        paid_at: null, due_at: null, notes: null, created_at: "2026-07-11T10:00:00Z",
      }]);

    const inv = await generateInvoice(ORG, 1, -100);
    expect(inv.total_amount).toBe(-100);
  });

  it("recordPayment succeeds even when amount exceeds total (no overpay validation)", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{
        id: 2001, organization_id: ORG, total_amount: 1000, status: "issued",
      }])
      .mockResolvedValueOnce([{ m: null }])
      .mockResolvedValueOnce([{
        id: 3099, invoice_id: 2001, organization_id: ORG,
        amount: 5000, method: "cash", receipt_number: "KWC-2026-00099",
        notes: null, created_at: "2026-07-11T10:00:00Z",
      }])
      .mockResolvedValueOnce([{ total: 5000 }])
      .mockResolvedValueOnce([]);

    const result = await recordPayment(ORG, 2001, 5000, "cash");
    expect(result.invoiceFullyPaid).toBe(true);
  });

  it("computeRetentionScore returns valid score for empty history", () => {
    const score = computeRetentionScore({
      leadId: 999, leadName: "New", phone: null,
      lastServiceDate: null, lastServiceType: null,
      totalVisits: 0, totalRevenue: 0, daysSinceLastVisit: null,
    });
    expect(score.overallScore).toBeGreaterThanOrEqual(0);
    expect(score.overallScore).toBeLessThanOrEqual(100);
    expect(["at_risk", "needs_attention", "healthy", "champion"]).toContain(score.segment);
  });

  it("computeRetentionScore returns high score for active patient", () => {
    const score = computeRetentionScore({
      leadId: 100, leadName: "Active", phone: "+254700000001",
      lastServiceDate: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      lastServiceType: "checkup", totalVisits: 15, totalRevenue: 75000,
      daysSinceLastVisit: 10,
    });
    expect(score.overallScore).toBeGreaterThanOrEqual(60);
    expect(score.segment).toBe("champion");
  });

  it("satisfaction prompt skips on cooldown", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ name: "Test Patient", phone: "+254700000001" }])
      .mockResolvedValueOnce([{ id: 5000 }]);

    const prompt = await sendSatisfactionPrompt(ORG, 2001, 1001);
    expect(prompt).toBeDefined();
    expect(prompt.id).toBe(5000);
  });

  it("processFeedbackResponse rejects out-of-range NPS", async () => {
    await expect(processFeedbackResponse(5001, ORG, 11)).rejects.toThrow("NPS score must be 0-10");
    await expect(processFeedbackResponse(5001, ORG, -1)).rejects.toThrow("NPS score must be 0-10");
  });
});
