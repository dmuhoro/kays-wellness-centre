import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { unsafe: vi.fn() };
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
  getConcurrentLock: vi.fn(() => Promise.resolve(true)),
  releaseConcurrentLock: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    CHECKOUT_CREATED: "CHECKOUT_CREATED",
    CHECKOUT_COMPLETED: "CHECKOUT_COMPLETED",
    CHECKOUT_FAILED: "CHECKOUT_FAILED",
    TIER_ACTIVATED: "TIER_ACTIVATED",
  },
}));
vi.mock("@/lib/audit.server", () => ({ recordAudit: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/session.server", () => ({ getSession: vi.fn(() => ({ userId: 1 })) }));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("Checkout Initiation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("creates a checkout session for tier upgrade", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { initiateCheckout } = await import("@/lib/checkout.server");
    const result = await initiateCheckout("org-1", "growth", "mpesa");

    expect(result.sessionId).toMatch(/^chk_/);
    expect(result.amountKes).toBe(12000);
    expect(result.targetTier).toBe("growth");
    expect(result.provider).toBe("mpesa");
    expect(result.status).toBe("pending");
    expect(result.checkoutUrl).toContain("/api/checkout/");
  });

  it("returns existing session if one is pending", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: "chk_existing123", status: "pending" },
    ]);

    const { initiateCheckout } = await import("@/lib/checkout.server");
    const result = await initiateCheckout("org-1", "growth", "mpesa");

    expect(result.sessionId).toBe("chk_existing123");
    expect(mockDb.unsafe).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO checkout_sessions"),
      expect.anything(),
    );
  });

  it("sets correct amount for enterprise tier", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { initiateCheckout } = await import("@/lib/checkout.server");
    const result = await initiateCheckout("org-1", "enterprise", "card");

    expect(result.amountKes).toBe(35000);
    expect(result.provider).toBe("card");
  });

  it("throws for invalid tier", async () => {
    const { initiateCheckout } = await import("@/lib/checkout.server");
    await expect(
      initiateCheckout("org-1", "nonexistent" as any, "mpesa"),
    ).rejects.toThrow("Invalid target tier");
  });
});

describe("Webhook Receipt Processing", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("activates tier on successful payment receipt", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ id: "chk-1", organization_id: "org-1", target_tier: "growth", status: "pending" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { processWebhookReceipt } = await import("@/lib/checkout.server");
    const result = await processWebhookReceipt({
      provider: "mpesa",
      externalRef: "SBI12345678",
      amountKes: 12000,
      status: "success",
      rawPayload: {},
    });

    expect(result.activated).toBe(true);
    expect(result.orgId).toBe("org-1");
    expect(result.tier).toBe("growth");
  });

  it("records failure on failed payment", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ id: "chk-2", organization_id: "org-1", target_tier: "growth", status: "pending" }])
      .mockResolvedValueOnce([]);

    const { processWebhookReceipt } = await import("@/lib/checkout.server");
    const result = await processWebhookReceipt({
      provider: "mpesa",
      externalRef: "SBI_FAILED",
      amountKes: 12000,
      status: "failed",
      rawPayload: { error: "insufficient funds" },
    });

    expect(result.activated).toBe(false);
  });

  it("skips already-completed checkout", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: "chk-3", organization_id: "org-1", target_tier: "growth", status: "completed" },
    ]);

    const { processWebhookReceipt } = await import("@/lib/checkout.server");
    const result = await processWebhookReceipt({
      provider: "mpesa",
      externalRef: "SBI_ALREADY",
      amountKes: 12000,
      status: "success",
      rawPayload: {},
    });

    expect(result.activated).toBe(false);
    expect(result.orgId).toBe("org-1");
  });

  it("returns not found for unknown external ref", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);

    const { processWebhookReceipt } = await import("@/lib/checkout.server");
    const result = await processWebhookReceipt({
      provider: "mpesa",
      externalRef: "UNKNOWN_REF",
      amountKes: 5000,
      status: "success",
      rawPayload: {},
    });

    expect(result.activated).toBe(false);
  });
});

describe("Direct Tier Activation", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("activates tier directly with lock", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ subscription_tier: "starter" }])
      .mockResolvedValueOnce([]);

    const { activateTier } = await import("@/lib/checkout.server");
    const result = await activateTier("org-1", "enterprise");

    expect(result.success).toBe(true);
    expect(result.previousTier).toBe("starter");
  });

  it("records previous tier correctly", async () => {
    mockDb.unsafe
      .mockResolvedValueOnce([{ subscription_tier: "growth" }])
      .mockResolvedValueOnce([]);

    const { activateTier } = await import("@/lib/checkout.server");
    const result = await activateTier("org-1", "enterprise");

    expect(result.previousTier).toBe("growth");
  });
});

describe("Checkout Session Retrieval", () => {
  it("retrieves session by ID and org", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      id: "chk-1",
      organization_id: "org-1",
      target_tier: "growth",
      payment_provider: "mpesa",
      amount_kes: 12000,
      status: "pending",
      external_ref: null,
      metadata: {},
      created_at: "2026-07-11T10:00:00Z",
      completed_at: null,
    }]);

    const { getCheckoutSession } = await import("@/lib/checkout.server");
    const session = await getCheckoutSession("org-1", "chk-1");
    expect(session).not.toBeNull();
    expect(session!.id).toBe("chk-1");
    expect(session!.targetTier).toBe("growth");
    expect(session!.amountKes).toBe(12000);
  });

  it("returns null for non-existent session", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getCheckoutSession } = await import("@/lib/checkout.server");
    const session = await getCheckoutSession("org-1", "nonexistent");
    expect(session).toBeNull();
  });

  it("returns null when DB unavailable", async () => {
    const { isDbAvailable } = await import("@/lib/db.server");
    (isDbAvailable as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    const { getCheckoutSession } = await import("@/lib/checkout.server");
    const session = await getCheckoutSession("org-1", "chk-1");
    expect(session).toBeNull();
  });
});

describe("Checkout History", () => {
  it("returns paginated checkout history", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: "chk-1", organization_id: "org-1", target_tier: "growth", payment_provider: "mpesa", amount_kes: 12000, status: "completed", external_ref: "ref1", metadata: {}, created_at: "2026-07-11T10:00:00Z", completed_at: "2026-07-11T10:05:00Z" },
      { id: "chk-2", organization_id: "org-1", target_tier: "enterprise", payment_provider: "card", amount_kes: 35000, status: "pending", external_ref: null, metadata: {}, created_at: "2026-07-10T10:00:00Z", completed_at: null },
    ]);

    const { getCheckoutHistory } = await import("@/lib/checkout.server");
    const history = await getCheckoutHistory("org-1");
    expect(history).toHaveLength(2);
    expect(history[0].status).toBe("completed");
    expect(history[1].amountKes).toBe(35000);
  });
});
