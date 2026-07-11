import { describe, it, expect } from "vitest";
import {
  MEDICAL_SERVICES,
  TRIAGE_SCRIPTS,
  MESSAGE_TEMPLATES,
  validateSeedData,
  medicalServicesSchema,
  triageScriptSchema,
  messageTemplateSchema,
} from "@/lib/seed.server";

describe("MedicalServices seed data", () => {
  it("has at least 12 services", () => {
    expect(MEDICAL_SERVICES.length).toBeGreaterThanOrEqual(12);
  });

  it("all services pass schema validation", () => {
    for (const s of MEDICAL_SERVICES) {
      expect(medicalServicesSchema.safeParse(s).success).toBe(true);
    }
  });

  it("each service has unique code", () => {
    const codes = MEDICAL_SERVICES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("includes BHRT service", () => {
    const bhrt = MEDICAL_SERVICES.find((s) => s.code === "BHRT");
    expect(bhrt).toBeDefined();
    expect(bhrt!.name).toContain("Hormone");
    expect(bhrt!.defaultPrice).toBeGreaterThan(0);
  });

  it("includes functional medicine assessment", () => {
    const fm = MEDICAL_SERVICES.find((s) => s.code === "FUNCTIONAL-MD");
    expect(fm).toBeDefined();
    expect(fm!.durationMinutes).toBe(90);
  });

  it("all prices are positive", () => {
    for (const s of MEDICAL_SERVICES) {
      expect(s.defaultPrice).toBeGreaterThan(0);
    }
  });

  it("all durations are positive integers", () => {
    for (const s of MEDICAL_SERVICES) {
      expect(Number.isInteger(s.durationMinutes)).toBe(true);
      expect(s.durationMinutes).toBeGreaterThan(0);
    }
  });
});

describe("TriageScripts seed data", () => {
  it("has at least 6 scripts", () => {
    expect(TRIAGE_SCRIPTS.length).toBeGreaterThanOrEqual(6);
  });

  it("all scripts pass schema validation", () => {
    for (const t of TRIAGE_SCRIPTS) {
      expect(triageScriptSchema.safeParse(t).success).toBe(true);
    }
  });

  it("each script has unique id", () => {
    const ids = TRIAGE_SCRIPTS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("initial-contact has 5 min delay", () => {
    const ic = TRIAGE_SCRIPTS.find((t) => t.id === "initial-contact");
    expect(ic).toBeDefined();
    expect(ic!.delayMinutes).toBe(5);
  });

  it("all scripts have non-empty body with template variable", () => {
    for (const t of TRIAGE_SCRIPTS) {
      expect(t.body.length).toBeGreaterThan(10);
      expect(t.body).toContain("{{");
    }
  });
});

describe("MessageTemplates seed data", () => {
  it("has at least 5 templates", () => {
    expect(MESSAGE_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it("all templates pass schema validation", () => {
    for (const t of MESSAGE_TEMPLATES) {
      expect(messageTemplateSchema.safeParse(t).success).toBe(true);
    }
  });

  it("each template has unique id", () => {
    const ids = MESSAGE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("welcome-intake has name and intake_url variables", () => {
    const welcome = MESSAGE_TEMPLATES.find((t) => t.id === "welcome-intake");
    expect(welcome).toBeDefined();
    expect(welcome!.variables).toContain("name");
    expect(welcome!.variables).toContain("intake_url");
  });

  it("categories are present", () => {
    const categories = MESSAGE_TEMPLATES.map((t) => t.category);
    expect(categories).toContain("onboarding");
    expect(categories).toContain("billing");
    expect(categories).toContain("clinical");
  });
});

describe("validateSeedData", () => {
  it("returns valid for current seed data", () => {
    const result = validateSeedData();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
