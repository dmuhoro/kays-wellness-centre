export interface StressResult {
  operation: string;
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  errors: string[];
}

export interface StressSummary {
  results: StressResult[];
  totalOperations: number;
  totalSucceeded: number;
  totalFailed: number;
  totalDurationMs: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runConcurrent<T>(
  label: string,
  count: number,
  fn: (i: number) => Promise<T>,
  concurrency = 50,
): Promise<StressResult> {
  const start = Date.now();
  const succeeded: number[] = [];
  const failed: { index: number; error: string }[] = [];

  const queue: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < count) {
      const i = index++;
      try {
        await fn(i);
        succeeded.push(i);
      } catch (err) {
        failed.push({ index: i, error: (err as Error).message });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, count) }, () => worker());
  await Promise.all(workers);

  return {
    operation: label,
    total: count,
    succeeded: succeeded.length,
    failed: failed.length,
    durationMs: Date.now() - start,
    errors: failed.map((f) => `#${f.index}: ${f.error}`),
  };
}

export class MockDb {
  private lockedKeys = new Map<string, boolean>();
  private conflictLog: string[] = [];
  private totalOps = 0;

  async acquireLock(key: string, timeoutMs = 100): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.lockedKeys.get(key)) {
        this.lockedKeys.set(key, true);
        this.totalOps++;
        return true;
      }
      await delay(1);
    }
    this.conflictLog.push(`Lock timeout: ${key}`);
    return false;
  }

  releaseLock(key: string): void {
    this.lockedKeys.set(key, false);
  }

  getStats() {
    return {
      totalOps: this.totalOps,
      conflicts: this.conflictLog.length,
      conflictDetails: [...this.conflictLog],
    };
  }
}

export async function simulateLeadDrag(
  db: MockDb,
  leadId: number,
  fromStage: string,
  toStage: string,
): Promise<void> {
  const lockKey = `lead:${leadId}`;
  const acquired = await db.acquireLock(lockKey, 50);
  if (!acquired) throw new Error(`CONFLICT: lead ${leadId} locked`);
  await delay(2 + Math.random() * 3);
  db.releaseLock(lockKey);
}

export async function simulateWebhookNotification(
  db: MockDb,
  leadId: number,
): Promise<void> {
  const lockKey = `webhook:${leadId}`;
  const acquired = await db.acquireLock(lockKey, 30);
  if (!acquired) throw new Error(`CONFLICT: webhook ${leadId} locked`);
  await delay(1 + Math.random() * 2);
  db.releaseLock(lockKey);
}

export async function simulateInvoicePayment(
  db: MockDb,
  invoiceId: number,
): Promise<void> {
  const lockKey = `invoice:${invoiceId}`;
  const acquired = await db.acquireLock(lockKey, 50);
  if (!acquired) throw new Error(`CONFLICT: invoice ${invoiceId} locked`);
  await delay(3 + Math.random() * 4);
  db.releaseLock(lockKey);
}

export async function runStressSuite(): Promise<StressSummary> {
  const db = new MockDb();
  const results: StressResult[] = [];

  results.push(
    await runConcurrent(
      "Lead drag (concurrent status changes)",
      200,
      (i) => simulateLeadDrag(db, i % 50, "pending", "contacted"),
      50,
    ),
  );

  results.push(
    await runConcurrent(
      "Webhook notifications (inbound)",
      150,
      (i) => simulateWebhookNotification(db, i % 50),
      50,
    ),
  );

  results.push(
    await runConcurrent(
      "Invoice payments (concurrent billing)",
      150,
      (i) => simulateInvoicePayment(db, i % 30),
      50,
    ),
  );

  const totalOps = results.reduce((s, r) => s + r.total, 0);
  const totalSucceeded = results.reduce((s, r) => s + r.succeeded, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0);

  return { results, totalOperations: totalOps, totalSucceeded, totalFailed, totalDurationMs };
}
