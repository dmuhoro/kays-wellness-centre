import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: () => mockLogger,
};

vi.mock("../lib/logger.server", () => ({
  logger: mockLogger,
  EVENTS: {
    NOTIFICATION_DISPATCHED: "NOTIFICATION_DISPATCHED",
    NOTIFICATION_FAILED: "NOTIFICATION_FAILED",
    NOTIFICATION_ENQUEUED: "NOTIFICATION_ENQUEUED",
  },
}));

vi.mock("../lib/db.server", () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn().mockReturnValue(true),
}));

vi.mock("../lib/queue.server", () => ({
  enqueueNotification: vi.fn().mockResolvedValue({ id: 1, status: "queued" }),
}));

describe("dispatch server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formatMessage creates confirmation message", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe");
    expect(msg).toContain("Jane Doe");
    expect(msg).toContain("confirmed");
    expect(msg).toContain("Kay's Wellness Centre");
  });

  it("formatMessage creates triage follow-up message", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("triage_followup", "John Smith");
    expect(msg).toContain("John Smith");
    expect(msg).toContain("following up");
    expect(msg).toContain("Reply STOP");
  });

  it("formatMessage creates reminder message", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("reminder", "Alice");
    expect(msg).toContain("Reminder");
    expect(msg).toContain("tomorrow");
    expect(msg).toContain("Kay's Wellness Centre");
  });

  it("sendWhatsApp logs when provider not configured", async () => {
    const originalToken = process.env.WHATSAPP_TOKEN;
    const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;

    const { sendWhatsApp } = await import("../lib/api/dispatch.server");
    const result = await sendWhatsApp("+254700000000", "Test message");

    expect(result.success).toBe(true);
    expect(result.provider).toBe("log");

    if (originalToken) process.env.WHATSAPP_TOKEN = originalToken;
    if (originalPhoneId) process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  });
});

describe("dispatchLeadMessage server function", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports dispatchLeadMessage as a function", async () => {
    const mod = await import("../lib/api/dispatch.server");
    expect(mod).toHaveProperty("dispatchLeadMessage");
    expect(typeof mod.dispatchLeadMessage).toBe("function");
  });
});
