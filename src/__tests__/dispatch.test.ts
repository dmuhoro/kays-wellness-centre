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

vi.mock("../lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

describe("bilingual formatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to English when no language given", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe");
    expect(msg).toContain("Jane Doe");
    expect(msg).toContain("confirmed");
    expect(msg).toContain("Kay's Wellness Centre");
    expect(msg).not.toContain("Habari");
  });

  it("returns English for en language code", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe", "en");
    expect(msg).toContain("Jane Doe");
    expect(msg).toContain("confirmed");
    expect(msg).not.toContain("Habari");
  });

  it("returns Swahili for sw language code", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe", "sw");
    expect(msg).toContain("Jane Doe");
    expect(msg).toContain("Habari");
    expect(msg).toContain("imethibitishwa");
    expect(msg).toContain("Kay's Wellness Centre");
  });

  it("Swahili confirmation template reads naturally", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe", "sw");
    expect(msg).toContain("miadi yako");
    expect(msg).toContain("dakika 15");
    expect(msg).toContain("kuacha kupokea ujumbe");
  });

  it("Swahili triage_followup template reads naturally", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("triage_followup", "John", "sw");
    expect(msg).toContain("Habari John");
    expect(msg).toContain("tukifuatilia");
    expect(msg).toContain("itawasiliana nawe");
  });

  it("Swahili reminder template reads naturally", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("reminder", "Alice", "sw");
    expect(msg).toContain("Kikumbusho");
    expect(msg).toContain("kesho");
    expect(msg).toContain("kubadilisha ratiba");
  });

  it("English confirmation template unchanged", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("confirmation", "Jane Doe");
    expect(msg).toContain("Jane Doe");
    expect(msg).toContain("confirmed");
    expect(msg).toContain("Kay's Wellness Centre");
    expect(msg).toContain("15 minutes early");
    expect(msg).toContain("Reply STOP");
  });

  it("English triage follow-up template unchanged", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("triage_followup", "John Smith");
    expect(msg).toContain("John Smith");
    expect(msg).toContain("following up");
    expect(msg).toContain("Reply STOP");
  });

  it("English reminder template unchanged", async () => {
    const { formatMessage } = await import("../lib/api/dispatch.server");
    const msg = formatMessage("reminder", "Alice");
    expect(msg).toContain("Reminder");
    expect(msg).toContain("tomorrow");
    expect(msg).toContain("Kay's Wellness Centre");
  });
});

describe("sendWhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs when provider not configured", async () => {
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
