import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, formatDate, parseAmount, getCurrencyConfig } from "@/lib/currency";

describe("getCurrencyConfig", () => {
  it("returns KES config by default", () => {
    const cfg = getCurrencyConfig();
    expect(cfg.code).toBe("KES");
    expect(cfg.symbol).toBe("KES");
  });

  it("returns USD config", () => {
    const cfg = getCurrencyConfig("USD");
    expect(cfg.code).toBe("USD");
    expect(cfg.symbol).toBe("$");
  });

  it("falls back to KES for unknown code", () => {
    const cfg = getCurrencyConfig("XYZ");
    expect(cfg.code).toBe("KES");
  });

  it("handles null gracefully", () => {
    const cfg = getCurrencyConfig(null);
    expect(cfg.code).toBe("KES");
  });
});

describe("formatCurrency", () => {
  it("formats KES amount", () => {
    const result = formatCurrency(2500, "KES");
    expect(result).toContain("2,500");
  });

  it("formats USD amount with symbol", () => {
    const result = formatCurrency(99.99, "USD");
    expect(result).toContain("$");
  });

  it("handles zero", () => {
    const result = formatCurrency(0, "KES");
    expect(result).toContain("0");
  });

  it("handles large numbers", () => {
    const result = formatCurrency(1500000, "KES");
    expect(result).toContain("1,500,000");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string", () => {
    const result = formatDate("2026-07-11T14:30:00Z");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });
});

describe("parseAmount", () => {
  it("parses simple number", () => {
    expect(parseAmount("2500")).toBe(2500);
  });

  it("strips currency symbol", () => {
    expect(parseAmount("$1,500")).toBe(1500);
  });

  it("handles decimal", () => {
    expect(parseAmount("99.99")).toBe(99.99);
  });

  it("returns 0 for empty string", () => {
    expect(parseAmount("")).toBe(0);
  });
});
