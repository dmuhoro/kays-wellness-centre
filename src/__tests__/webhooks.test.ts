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
  EVENTS: {
    INTERACTION_RECORDED: "INTERACTION_RECORDED",
    DATA_EXPORT: "DATA_EXPORT",
    WEBHOOK_DELIVERED: "WEBHOOK_DELIVERED",
    WEBHOOK_DELIVERY_FAILED: "WEBHOOK_DELIVERY_FAILED",
  },
}));
vi.mock("@/lib/audit.server", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/session.server", () => ({ getSession: vi.fn(() => ({ userId: 1 })) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("Webhook Signing & Signature Verification", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("generateWebhookSecret produces a 64-char hex string", async () => {
    const { generateWebhookSecret } = await import("@/lib/webhooks.server");
    const secret = generateWebhookSecret();
    expect(secret).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
  });

  it("signPayload produces deterministic HMAC-SHA256", async () => {
    const { signPayload } = await import("@/lib/webhooks.server");
    const sig1 = signPayload('{"event":"test"}', "secret123");
    const sig2 = signPayload('{"event":"test"}', "secret123");
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  it("signPayload changes with different secrets", async () => {
    const { signPayload } = await import("@/lib/webhooks.server");
    const sig1 = signPayload('{"event":"test"}', "secret1");
    const sig2 = signPayload('{"event":"test"}', "secret2");
    expect(sig1).not.toBe(sig2);
  });

  it("signPayload changes with different payloads", async () => {
    const { signPayload } = await import("@/lib/webhooks.server");
    const sig1 = signPayload('{"event":"a"}', "secret");
    const sig2 = signPayload('{"event":"b"}', "secret");
    expect(sig1).not.toBe(sig2);
  });

  it("verifyWebhookSignature accepts valid signature", async () => {
    const { signPayload, verifyWebhookSignature } = await import("@/lib/webhooks.server");
    const payload = '{"event":"lead.created"}';
    const secret = "test-secret-key";
    const sig = signPayload(payload, secret);
    expect(verifyWebhookSignature(payload, `sha256=${sig}`, secret)).toBe(true);
  });

  it("verifyWebhookSignature rejects invalid signature", async () => {
    const { verifyWebhookSignature } = await import("@/lib/webhooks.server");
    expect(verifyWebhookSignature('{"event":"test"}', "sha256=0000000000000000000000000000000000000000000000000000000000000000", "secret")).toBe(false);
  });

  it("verifyWebhookSignature rejects wrong payload", async () => {
    const { signPayload, verifyWebhookSignature } = await import("@/lib/webhooks.server");
    const sig = signPayload('{"event":"correct"}', "secret");
    expect(verifyWebhookSignature('{"event":"wrong"}', `sha256=${sig}`, "secret")).toBe(false);
  });

  it("verifyWebhookSignature accepts without sha256 prefix", async () => {
    const { signPayload, verifyWebhookSignature } = await import("@/lib/webhooks.server");
    const payload = "test-body";
    const secret = "my-secret";
    const sig = signPayload(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });
});

describe("Webhook Registration & Queries", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("registerWebhook inserts and returns config", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      id: 1, organization_id: "org-1", url: "https://example.com/hook",
      secret: "abc123", events: ["lead.created"], active: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);
    const { registerWebhook } = await import("@/lib/webhooks.server");
    const config = await registerWebhook("org-1", "https://example.com/hook", ["lead.created"]);
    expect(config.url).toBe("https://example.com/hook");
    expect(config.events).toEqual(["lead.created"]);
    expect(config.active).toBe(true);
  });

  it("getWebhooks returns list for org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, organization_id: "org-1", url: "https://a.com", secret: "s", events: ["*"], active: true, created_at: "2026-01-01", updated_at: "2026-01-01" },
      { id: 2, organization_id: "org-1", url: "https://b.com", secret: "s", events: ["lead.created"], active: false, created_at: "2026-01-02", updated_at: "2026-01-02" },
    ]);
    const { getWebhooks } = await import("@/lib/webhooks.server");
    const hooks = await getWebhooks("org-1");
    expect(hooks).toHaveLength(2);
    expect(hooks[0].url).toBe("https://a.com");
  });

  it("removeWebhook deletes by id and org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { removeWebhook } = await import("@/lib/webhooks.server");
    await removeWebhook("org-1", 99);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM webhook_configs"),
      [99, "org-1"],
    );
  });
});

describe("Webhook Delivery Lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("recordDelivery inserts pending delivery", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{ id: 42 }]);
    const { recordDelivery } = await import("@/lib/webhooks.server");
    const id = await recordDelivery("org-1", 1, "lead.created", { leadId: 1 });
    expect(id).toBe(42);
  });

  it("updateDeliveryStatus sets success with response code", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { updateDeliveryStatus } = await import("@/lib/webhooks.server");
    await updateDeliveryStatus(42, "success", 200, 150);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE webhook_deliveries"),
      expect.arrayContaining(["success", 200, 150, 42]),
    );
  });

  it("updateDeliveryStatus increments retry count", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { updateDeliveryStatus } = await import("@/lib/webhooks.server");
    await updateDeliveryStatus(42, "retrying", undefined, undefined, "timeout");
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("retry_count = retry_count + 1"),
      expect.arrayContaining(["retrying", "timeout", 42]),
    );
  });

  it("getWebhookDeliveries queries with filters", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getWebhookDeliveries } = await import("@/lib/webhooks.server");
    await getWebhookDeliveries("org-1", { status: "failed", eventType: "lead.created", limit: 10 });
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("wd.status = $2"),
      expect.arrayContaining(["org-1", "failed", "lead.created"]),
    );
  });

  it("getDeliveryStats aggregates by status", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { status: "success", count: "5" },
      { status: "failed", count: "2" },
      { status: "pending", count: "1" },
    ]);
    const { getDeliveryStats } = await import("@/lib/webhooks.server");
    const stats = await getDeliveryStats("org-1");
    expect(stats.total).toBe(8);
    expect(stats.success).toBe(5);
    expect(stats.failed).toBe(2);
    expect(stats.pending).toBe(1);
  });
});
