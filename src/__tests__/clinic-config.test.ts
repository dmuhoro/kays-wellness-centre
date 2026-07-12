import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  unsafe: vi.fn(),
};
vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(() => mockDb),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/tenant.server", () => ({
  requireOrg: vi.fn(() => ({ orgId: "org-1", log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } })),
}));

vi.mock("@/lib/permissions.server", () => ({
  requireRole: vi.fn(),
  ROLES: { SUPER_ADMIN: "super_admin", CLINIC_OWNER: "admin", CLINIC_STAFF: "staff" },
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {
    CONFIG_UPDATED: "CONFIG_UPDATED",
    CONFIG_FETCHED: "CONFIG_FETCHED",
  },
}));

describe("Clinic Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.unsafe.mockReset();
  });

  describe("updateClinicConfigSchema validation", () => {
    it("accepts valid configuration", async () => {
      const { updateClinicConfigSchema } = await import("@/lib/api/clinic-config.server");
      const result = updateClinicConfigSchema.safeParse({
        business_hours: {
          monday: { open: "08:00", close: "17:00" },
          tuesday: { open: "09:00", close: "18:00" },
        },
        slot_duration_minutes: 30,
        triage_timeout_minutes: 45,
        custom_keywords: ["opt-out", "escalate"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects open time after close time", async () => {
      const { updateClinicConfigSchema } = await import("@/lib/api/clinic-config.server");
      const result = updateClinicConfigSchema.safeParse({
        business_hours: {
          monday: { open: "17:00", close: "08:00" },
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects triage timeout less than 5 minutes at the server level", async () => {
      const { updateClinicConfig } = await import("@/lib/api/clinic-config.server");
      await expect(updateClinicConfig("org-1", { triage_timeout_minutes: 2 }))
        .rejects.toThrow("Triage timeout cannot be less than 5 minutes");
    });

  it("accepts triage timeout of exactly 5 minutes", async () => {
    mockDb.unsafe.mockReset();
    mockDb.unsafe.mockResolvedValue([{
      id: 1, organization_id: "org-1",
      business_hours: {}, slot_duration_minutes: 30, triage_timeout_minutes: 5,
      custom_keywords: [], timezone: "UTC",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }]);

    const { updateClinicConfig } = await import("@/lib/api/clinic-config.server");
    const config = await updateClinicConfig("org-1", { triage_timeout_minutes: 5 });
    expect(config.triage_timeout_minutes).toBe(5);
  });

    it("rejects invalid time format", async () => {
      const { updateClinicConfigSchema } = await import("@/lib/api/clinic-config.server");
      const result = updateClinicConfigSchema.safeParse({
        business_hours: {
          monday: { open: "8:00", close: "17:00" },
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty custom keyword", async () => {
      const { updateClinicConfigSchema } = await import("@/lib/api/clinic-config.server");
      const result = updateClinicConfigSchema.safeParse({
        custom_keywords: [""],
      });
      expect(result.success).toBe(false);
    });
  });

  describe("ensureClinicConfig", () => {
    it("creates default config when none exists", async () => {
      mockDb.unsafe.mockReset();
      mockDb.unsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: 1, organization_id: "org-1",
          business_hours: { monday: { open: "08:00", close: "17:00" } },
          slot_duration_minutes: 30, triage_timeout_minutes: 45,
          custom_keywords: [], timezone: "UTC",
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }]);
      const { ensureClinicConfig } = await import("@/lib/api/clinic-config.server");
      const config = await ensureClinicConfig("org-1");
      expect(config.slot_duration_minutes).toBe(30);
      expect(config.triage_timeout_minutes).toBe(45);
    });
  });

  describe("getCustomKeywords", () => {
    it("returns empty array when no config or no keywords", async () => {
      mockDb.unsafe.mockReset();
      mockDb.unsafe.mockResolvedValue([]);
      const { getCustomKeywords } = await import("@/lib/api/clinic-config.server");
      const keywords = await getCustomKeywords("org-1");
      expect(keywords).toEqual([]);
    });

    it("returns custom keywords from config", async () => {
      mockDb.unsafe.mockReset();
      mockDb.unsafe.mockResolvedValue([{
        id: 1, organization_id: "org-1",
        business_hours: {}, slot_duration_minutes: 30, triage_timeout_minutes: 45,
        custom_keywords: ["opt-out", "escalate", "unsubscribe"],
        timezone: "UTC",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }]);
      const { getCustomKeywords } = await import("@/lib/api/clinic-config.server");
      const keywords = await getCustomKeywords("org-1");
      expect(keywords).toEqual(["opt-out", "escalate", "unsubscribe"]);
    });
  });

  describe("Server Function Exports", () => {
    it("exports fetchClinicConfig and saveClinicConfig", async () => {
      const mod = await import("@/lib/api/clinic-config.server");
      expect(mod.fetchClinicConfig).toBeDefined();
      expect(mod.saveClinicConfig).toBeDefined();
    });
  });
});
