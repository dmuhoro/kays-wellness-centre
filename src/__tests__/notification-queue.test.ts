import { describe, it, expect, beforeEach, vi } from "vitest";

const mockUnsafe = vi.fn();
const mockGetDb = vi.fn().mockResolvedValue({ unsafe: mockUnsafe });

vi.mock("../lib/db.server", () => ({
  getDb: () => mockGetDb(),
  withDb: async (
    fn: (db: unknown) => Promise<unknown>,
    fallback: () => Promise<unknown>,
  ) => {
    try {
      return await fn(await mockGetDb());
    } catch {
      return fallback();
    }
  },
}));

const fakeLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => fakeLogger,
};

vi.mock("../lib/logger.server", () => ({
  logger: fakeLogger,
  EVENTS: {
    NOTIFICATION_ENQUEUED: "NOTIFICATION_ENQUEUED",
    NOTIFICATION_DISPATCHED: "NOTIFICATION_DISPATCHED",
    NOTIFICATION_FAILED: "NOTIFICATION_FAILED",
    NOTIFICATION_RETRY: "NOTIFICATION_RETRY",
    NOTIFICATION_IDEMPOTENCY_SKIP: "NOTIFICATION_IDEMPOTENCY_SKIP",
    SCHEMA_SETUP: "SCHEMA_SETUP",
    QUEUE_SYNC_FAILURE: "QUEUE_SYNC_FAILURE",
    QUEUE_SYNC_SUCCESS: "QUEUE_SYNC_SUCCESS",
  },
}));

const {
  enqueueNotification,
  processQueue,
  ensureQueueSchema,
} = await import("../lib/queue.server");

describe("notification queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUnsafe.mockReset();

    mockUnsafe.mockImplementation((sql: string, params?: unknown[]) => {
      if (
        sql.includes("CREATE TABLE IF NOT EXISTS notification_queue") ||
        sql.includes("CREATE INDEX IF NOT EXISTS")
      ) {
        return [];
      }
      if (sql.includes("SELECT id, status FROM notification_queue WHERE idempotency_key")) {
        return [];
      }
      if (sql.includes("INSERT INTO notification_queue")) {
        return [{ id: 1 }];
      }
      if (
        sql.includes("SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries")
      ) {
        return [];
      }
      if (sql.includes("UPDATE notification_queue")) {
        return [];
      }
      return [];
    });
  });

  it("ensureQueueSchema creates the table and index", async () => {
    const result = await ensureQueueSchema();
    expect(result).toBe(true);
    const createCalls = mockUnsafe.mock.calls.filter(
      ([s]: [string]) =>
        s.includes("CREATE TABLE") || s.includes("CREATE INDEX"),
    );
    expect(createCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("enqueues a notification and returns queued status", async () => {
    const result = await enqueueNotification({
      orgId: "org-1",
      leadId: 42,
      eventType: "lead_created",
    });
    expect(result.status).toBe("queued");
    expect(result.id).toBe(1);
  });

  it("returns already_pending when idempotency key exists", async () => {
    mockUnsafe.mockImplementation((sql: string) => {
      if (sql.includes("SELECT id, status FROM notification_queue WHERE idempotency_key")) {
        return [{ id: 5, status: "pending" }];
      }
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("CREATE INDEX")
      ) {
        return [];
      }
      return [];
    });

    const result = await enqueueNotification({
      orgId: "org-1",
      leadId: 42,
      eventType: "lead_created",
    });
    expect(result.status).toBe("already_pending");
    expect(result.id).toBe(5);
    expect(fakeLogger.info).toHaveBeenCalledWith(
      "Notification idempotency skip",
      expect.objectContaining({ event: "NOTIFICATION_IDEMPOTENCY_SKIP" }),
    );
  });

  it("processQueue processes zero rows when queue is empty", async () => {
    const result = await processQueue();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("processQueue dispatches a pending notification", async () => {
    const dispatch = vi.fn().mockResolvedValue({ success: true });

    mockUnsafe.mockImplementation((sql: string) => {
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("CREATE INDEX")
      ) {
        return [];
      }
      if (
        sql.includes("SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries")
      ) {
        return [
          {
            id: 10,
            tenant_id: "org-1",
            lead_id: 99,
            event_type: "lead_created",
            payload_json: null,
            retry_count: 0,
            max_retries: 3,
          },
        ];
      }
      if (sql.includes("UPDATE notification_queue")) {
        return [];
      }
      return [];
    });

    const result = await processQueue({ batchSize: 10, dispatch });
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(dispatch).toHaveBeenCalledWith({
      id: 10,
      tenantId: "org-1",
      leadId: 99,
      eventType: "lead_created",
      payload: null,
    });
  });

  it("processQueue retries on dispatch failure and increments retry_count", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("Gateway timeout"));

    let selectCallCount = 0;
    mockUnsafe.mockImplementation((sql: string) => {
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("CREATE INDEX")
      ) {
        return [];
      }
      if (
        sql.includes("SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries")
      ) {
        selectCallCount++;
        return [
          {
            id: 20,
            tenant_id: "org-2",
            lead_id: 55,
            event_type: "lead_created",
            payload_json: null,
            retry_count: 0,
            max_retries: 3,
          },
        ];
      }
      if (sql.includes("UPDATE notification_queue")) {
        return [];
      }
      return [];
    });

    const result = await processQueue({ batchSize: 10, dispatch });
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);

    const updateCall = mockUnsafe.mock.calls.find(
      ([s]: [string]) =>
        s.includes("UPDATE notification_queue") &&
        s.includes("status"),
    );
    expect(updateCall).toBeDefined();
    const [, params] = updateCall;
    expect(params[1]).toBeTruthy();
    expect(fakeLogger.warn).toHaveBeenCalledWith(
      "Notification dispatch failed",
      expect.objectContaining({
        event: "NOTIFICATION_RETRY",
        queueId: 20,
        retryCount: 1,
      }),
    );
  });

  it("marks job as failed when max retries exceeded", async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error("Permanent failure"));

    mockUnsafe.mockImplementation((sql: string) => {
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("CREATE INDEX")
      ) {
        return [];
      }
      if (
        sql.includes("SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries")
      ) {
        return [
          {
            id: 30,
            tenant_id: "org-3",
            lead_id: 77,
            event_type: "lead_created",
            payload_json: null,
            retry_count: 2,
            max_retries: 3,
          },
        ];
      }
      if (sql.includes("UPDATE notification_queue")) {
        return [];
      }
      return [];
    });

    const result = await processQueue({ batchSize: 10, dispatch });
    expect(result.failed).toBe(1);

    const updateCall = mockUnsafe.mock.calls.find(
      ([c, p]: [string, unknown[]]) =>
        c.includes("UPDATE notification_queue") && p?.includes("failed"),
    );
    expect(updateCall).toBeDefined();
    const [, params] = updateCall;
    expect(params[0]).toBe("failed");
    expect(params[1]).toBeNull();

    expect(fakeLogger.warn).toHaveBeenCalledWith(
      "Notification dispatch failed",
      expect.objectContaining({
        event: "NOTIFICATION_FAILED",
        retryCount: 3,
      }),
    );
  });

  it("processQueue uses custom dispatch function", async () => {
    const customDispatch = vi.fn().mockResolvedValue({ success: true });

    mockUnsafe.mockImplementation((sql: string) => {
      if (
        sql.includes("CREATE TABLE") ||
        sql.includes("CREATE INDEX")
      ) {
        return [];
      }
      if (
        sql.includes("SELECT id, tenant_id, lead_id, event_type, payload_json, retry_count, max_retries")
      ) {
        return [
          {
            id: 40,
            tenant_id: "org-4",
            lead_id: 88,
            event_type: "lead_created",
            payload_json: JSON.stringify({ source: "web" }),
            retry_count: 0,
            max_retries: 3,
          },
        ];
      }
      if (sql.includes("UPDATE notification_queue")) {
        return [];
      }
      return [];
    });

    const result = await processQueue({ batchSize: 5, dispatch: customDispatch });
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);
    expect(customDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 40,
        tenantId: "org-4",
        leadId: 88,
        payload: { source: "web" },
      }),
    );
  });
});