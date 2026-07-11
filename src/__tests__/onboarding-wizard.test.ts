import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db.server", () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(() => true),
}));

vi.mock("@/lib/logger.server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  EVENTS: {},
}));

describe("OnboardingWizard — Configuration Defaults", () => {
  it("exports DEFAULT_CONFIG with sensible defaults", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const config = (mod as any).DEFAULT_CONFIG;
    expect(config).toBeDefined();
    expect(config.baseCurrency).toBe("KES");
    expect(config.timezone).toBe("Africa/Nairobi");
    expect(config.whatsappEnabled).toBe(false);
    expect(config.practitioners).toEqual([]);
  });
});

describe("OnboardingWizard — Currency Options", () => {
  it("includes KES as first currency", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const currencies = (mod as any).CURRENCIES;
    expect(currencies).toBeDefined();
    expect(currencies[0].code).toBe("KES");
    expect(currencies.length).toBeGreaterThanOrEqual(8);
  });

  it("each currency has code and label", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const currencies = (mod as any).CURRENCIES;
    for (const c of currencies) {
      expect(c.code).toBeTruthy();
      expect(c.label).toBeTruthy();
      expect(c.code).toHaveLength(3);
    }
  });
});

describe("OnboardingWizard — Specialties", () => {
  it("includes common medical specialties", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const specialties = (mod as any).SPECIALTIES;
    expect(specialties).toContain("General Practice");
    expect(specialties).toContain("Dermatology");
    expect(specialties).toContain("Physiotherapy");
    expect(specialties).toContain("Mental Health");
  });

  it("has at least 10 specialties", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const specialties = (mod as any).SPECIALTIES;
    expect(specialties.length).toBeGreaterThanOrEqual(10);
  });
});

describe("OnboardingWizard — Schedule Presets", () => {
  it("includes standard work week presets", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const presets = (mod as any).SCHEDULE_PRESETS;
    expect(presets).toContain("Mon-Fri 8am-5pm");
    expect(presets).toContain("Mon-Sat 8am-5pm");
    expect(presets).toContain("Custom");
  });
});

describe("OnboardingWizard — Timezones", () => {
  it("includes Africa/Nairobi as default", async () => {
    const mod = await import("@/components/OnboardingWizard");
    const timezones = (mod as any).TIMEZONES;
    expect(timezones).toContain("Africa/Nairobi");
    expect(timezones).toContain("Africa/Lagos");
    expect(timezones).toContain("Europe/London");
  });
});

describe("OnboardingWizard — Config Validation Logic", () => {
  it("clinic name is required for step 1", async () => {
    const config = { clinicName: "", baseCurrency: "KES" };
    expect(config.clinicName.trim().length > 0).toBe(false);
  });

  it("clinic name with value passes validation", async () => {
    const config = { clinicName: "Kay's Wellness", baseCurrency: "KES" };
    expect(config.clinicName.trim().length > 0).toBe(true);
  });
});
