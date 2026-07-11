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
  EVENTS: { INTERACTION_RECORDED: "INTERACTION_RECORDED" },
}));
vi.mock("@/lib/event-bus.server", () => ({ publishEvent: vi.fn(() => Promise.resolve()) }));

describe("Message Ledger — logMessage", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("logMessage inserts and returns row for outbound", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      id: 1, organization_id: "org-1", lead_id: 10, channel: "whatsapp", direction: "outbound",
      from_address: "+254700000000", to_address: "+254711111111", body: "Hello",
      status: "sent", external_id: null, metadata: {}, created_at: new Date().toISOString(),
    }]);
    const { logMessage } = await import("@/lib/messaging.server");
    const msg = await logMessage({
      orgId: "org-1", leadId: 10, channel: "whatsapp", direction: "outbound",
      from: "+254700000000", to: "+254711111111", body: "Hello",
    });
    expect(msg.id).toBe(1);
    expect(msg.channel).toBe("whatsapp");
    expect(msg.direction).toBe("outbound");
    expect(msg.body).toBe("Hello");
  });

  it("logMessage sets default status for inbound", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      id: 2, organization_id: "org-1", lead_id: 10, channel: "sms", direction: "inbound",
      from_address: "+254711111111", to_address: "+254700000000", body: "Hi",
      status: "received", external_id: null, metadata: {}, created_at: new Date().toISOString(),
    }]);
    const { logMessage } = await import("@/lib/messaging.server");
    const msg = await logMessage({
      orgId: "org-1", leadId: 10, channel: "sms", direction: "inbound",
      from: "+254711111111", to: "+254700000000", body: "Hi",
    });
    expect(msg.status).toBe("received");
  });

  it("logMessage stores metadata", async () => {
    mockDb.unsafe.mockResolvedValueOnce([{
      id: 3, organization_id: "org-1", lead_id: null, channel: "whatsapp", direction: "outbound",
      from_address: "bot", to_address: "+254711111111", body: "Reminder",
      status: "sent", external_id: "ext-123", metadata: { template: "reminder" },
      created_at: new Date().toISOString(),
    }]);
    const { logMessage } = await import("@/lib/messaging.server");
    const msg = await logMessage({
      orgId: "org-1", channel: "whatsapp", direction: "outbound",
      from: "bot", to: "+254711111111", body: "Reminder",
      externalId: "ext-123", metadata: { template: "reminder" },
    });
    expect(msg.external_id).toBe("ext-123");
    expect(msg.lead_id).toBeNull();
  });
});

describe("Message Ledger — Queries", () => {
  beforeEach(() => { vi.clearAllMocks(); mockDb.unsafe.mockReset(); });

  it("getMessagesForLead returns messages for lead", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { id: 1, lead_id: 10, body: "msg1" },
      { id: 2, lead_id: 10, body: "msg2" },
    ]);
    const { getMessagesForLead } = await import("@/lib/messaging.server");
    const msgs = await getMessagesForLead("org-1", 10);
    expect(msgs).toHaveLength(2);
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("lead_id = $2"),
      expect.arrayContaining(["org-1", 10, 50, 0]),
    );
  });

  it("getMessagesByChannel filters by direction", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { getMessagesByChannel } = await import("@/lib/messaging.server");
    await getMessagesByChannel("org-1", "sms", { direction: "inbound" });
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("direction = $3"),
      expect.arrayContaining(["org-1", "sms", "inbound"]),
    );
  });

  it("getMessageStats aggregates counts", async () => {
    mockDb.unsafe.mockResolvedValueOnce([
      { direction: "inbound", channel: "whatsapp", count: "10" },
      { direction: "outbound", channel: "whatsapp", count: "8" },
      { direction: "inbound", channel: "sms", count: "3" },
      { direction: "outbound", channel: "sms", count: "5" },
    ]);
    const { getMessageStats } = await import("@/lib/messaging.server");
    const stats = await getMessageStats("org-1");
    expect(stats.total).toBe(26);
    expect(stats.inbound).toBe(13);
    expect(stats.outbound).toBe(13);
    expect(stats.whatsapp).toBe(18);
    expect(stats.sms).toBe(8);
  });

  it("updateMessageStatus updates status", async () => {
    mockDb.unsafe.mockResolvedValueOnce([]);
    const { updateMessageStatus } = await import("@/lib/messaging.server");
    await updateMessageStatus(1, "delivered", "ext-456");
    expect(mockDb.unsafe).toHaveBeenCalledWith(
      expect.stringContaining("SET status = $1"),
      ["delivered", "ext-456", 1],
    );
  });
});

describe("Message Utility Functions", () => {
  it("maskAddress masks middle characters", async () => {
    const { maskAddress } = await import("@/lib/messaging.server");
    expect(maskAddress("+254711222333")).toBe("+25********33");
  });

  it("maskAddress handles short addresses", async () => {
    const { maskAddress } = await import("@/lib/messaging.server");
    expect(maskAddress("abc")).toBe("****");
  });

  it("formatMessagePreview truncates long messages", async () => {
    const { formatMessagePreview } = await import("@/lib/messaging.server");
    const long = "A".repeat(100);
    expect(formatMessagePreview(long, 50)).toHaveLength(50);
    expect(formatMessagePreview(long, 50)).toContain("...");
  });

  it("formatMessagePreview preserves short messages", async () => {
    const { formatMessagePreview } = await import("@/lib/messaging.server");
    expect(formatMessagePreview("Hello")).toBe("Hello");
  });

  it("formatMessagePreview strips newlines", async () => {
    const { formatMessagePreview } = await import("@/lib/messaging.server");
    expect(formatMessagePreview("Hello\nWorld")).toBe("Hello World");
  });
});
