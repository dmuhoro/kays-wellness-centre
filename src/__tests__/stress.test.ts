import { describe, it, expect, vi } from "vitest";
import { MockDb, simulateLeadDrag, simulateWebhookNotification, simulateInvoicePayment, runStressSuite } from "@/lib/fixtures/stress-test";

describe("MockDb — distributed lock simulation", () => {
  it("acquires and releases locks", async () => {
    const db = new MockDb();
    const a = await db.acquireLock("a", 50);
    expect(a).toBe(true);
    db.releaseLock("a");
    const a2 = await db.acquireLock("a", 10);
    expect(a2).toBe(true);
  });

  it("prevents concurrent access to same key", async () => {
    const db = new MockDb();
    await db.acquireLock("x", 100);
    const second = await db.acquireLock("x", 10);
    expect(second).toBe(false);
    db.releaseLock("x");
  });

  it("tracks lock stats", async () => {
    const db = new MockDb();
    await db.acquireLock("a", 50);
    await db.acquireLock("b", 50);
    await db.acquireLock("c", 50);
    db.releaseLock("a");
    db.releaseLock("b");
    db.releaseLock("c");
    const stats = db.getStats();
    expect(stats.totalOps).toBe(3);
    expect(stats.conflicts).toBe(0);
  });
});

describe("simulateLeadDrag — concurrent status changes", () => {
  it("succeeds when no lock contention", async () => {
    const db = new MockDb();
    await simulateLeadDrag(db, 1, "pending", "contacted");
    expect(db.getStats().totalOps).toBe(1);
  });

  it("throws on lock conflict", async () => {
    const db = new MockDb();
    await db.acquireLock("lead:99", 100);
    await expect(simulateLeadDrag(db, 99, "pending", "contacted")).rejects.toThrow("CONFLICT");
    db.releaseLock("lead:99");
  });
});

describe("simulateWebhookNotification — inbound", () => {
  it("succeeds with available lock", async () => {
    const db = new MockDb();
    await simulateWebhookNotification(db, 42);
    expect(db.getStats().totalOps).toBe(1);
  });

  it("throws on lock conflict", async () => {
    const db = new MockDb();
    await db.acquireLock("webhook:7", 100);
    await expect(simulateWebhookNotification(db, 7)).rejects.toThrow("CONFLICT");
    db.releaseLock("webhook:7");
  });
});

describe("simulateInvoicePayment — concurrent billing", () => {
  it("succeeds with available lock", async () => {
    const db = new MockDb();
    await simulateInvoicePayment(db, 100);
    expect(db.getStats().totalOps).toBe(1);
  });

  it("throws on lock conflict", async () => {
    const db = new MockDb();
    await db.acquireLock("invoice:5", 100);
    await expect(simulateInvoicePayment(db, 5)).rejects.toThrow("CONFLICT");
    db.releaseLock("invoice:5");
  });
});

describe("runStressSuite — 500 concurrent operations", () => {
  it("executes all 500 operations across three categories", async () => {
    const summary = await runStressSuite();
    expect(summary.totalOperations).toBe(500);
    expect(summary.totalSucceeded + summary.totalFailed).toBe(500);
  });

  it("reports per-operation breakdown", async () => {
    const summary = await runStressSuite();
    expect(summary.results).toHaveLength(3);
    const leadDrag = summary.results.find((r) => r.operation.includes("Lead drag"));
    const webhook = summary.results.find((r) => r.operation.includes("Webhook"));
    const invoice = summary.results.find((r) => r.operation.includes("Invoice"));
    expect(leadDrag).toBeDefined();
    expect(webhook).toBeDefined();
    expect(invoice).toBeDefined();
    expect(leadDrag!.total).toBe(200);
    expect(webhook!.total).toBe(150);
    expect(invoice!.total).toBe(150);
  });

  it("has positive duration for each category", async () => {
    const summary = await runStressSuite();
    for (const r of summary.results) {
      expect(r.durationMs).toBeGreaterThan(0);
    }
  });

  it("returns error details for conflicts", async () => {
    const summary = await runStressSuite();
    for (const r of summary.results) {
      expect(Array.isArray(r.errors)).toBe(true);
    }
  });

  it("MockDb reports accurate stats after full suite", async () => {
    const db = new MockDb();
    const count = 100;
    const promises: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      promises.push(simulateLeadDrag(db, i % 10, "a", "b"));
    }
    await Promise.all(promises);
    const stats = db.getStats();
    expect(stats.totalOps).toBeGreaterThan(0);
    expect(stats.conflicts).toBeGreaterThanOrEqual(0);
  });
});
