import { describe, it, expect } from "vitest";
import { exportSchema, toCsvValue, rowsToCsv } from "@/lib/exports.server";

describe("exportSchema", () => {
  it("accepts all four dataset values", () => {
    for (const ds of ["leads", "invoices", "interactions", "audit_logs"]) {
      expect(exportSchema.safeParse({ dataset: ds }).success).toBe(true);
    }
  });

  it("rejects invalid dataset", () => {
    expect(exportSchema.safeParse({ dataset: "invalid" }).success).toBe(false);
  });

  it("accepts optional date range", () => {
    const valid = exportSchema.safeParse({
      dataset: "invoices",
      startDate: "2026-01-01",
      endDate: "2026-07-31",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects non-string date", () => {
    const result = exportSchema.safeParse({ dataset: "leads", startDate: 123 });
    expect(result.success).toBe(false);
  });
});

describe("toCsvValue", () => {
  it("wraps values containing commas", () => {
    expect(toCsvValue("hello, world")).toBe('"hello, world"');
  });

  it("wraps values containing quotes", () => {
    expect(toCsvValue('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps values containing newlines", () => {
    expect(toCsvValue("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null", () => {
    expect(toCsvValue(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toCsvValue(undefined)).toBe("");
  });

  it("passes through plain strings", () => {
    expect(toCsvValue("hello")).toBe("hello");
  });

  it("converts numbers to strings", () => {
    expect(toCsvValue(42)).toBe("42");
  });
});

describe("rowsToCsv", () => {
  it("generates header and data lines", () => {
    const rows = [{ name: "Jane", age: 30 }, { name: "Bob", age: 25 }];
    const csv = rowsToCsv(["name", "age"], rows);
    expect(csv).toBe("name,age\nJane,30\nBob,25");
  });

  it("handles empty rows", () => {
    const csv = rowsToCsv(["name", "age"], []);
    expect(csv).toBe("name,age");
  });

  it("quotes commas in values", () => {
    const rows = [{ address: "123 Main, Apt 4" }];
    const csv = rowsToCsv(["address"], rows);
    expect(csv).toBe('address\n"123 Main, Apt 4"');
  });
});
