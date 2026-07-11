import { describe, it, expect } from "vitest";
import { formatBytes, formatUsage } from "@/lib/metering.server";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });

  it("formats 5 GB correctly", () => {
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe("5.0 GB");
  });

  it("formats 20 GB correctly", () => {
    expect(formatBytes(20 * 1024 * 1024 * 1024)).toBe("20 GB");
  });

  it("formats 100 GB correctly", () => {
    expect(formatBytes(100 * 1024 * 1024 * 1024)).toBe("100 GB");
  });

  it("formats 1.5 MB correctly", () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats mixed values", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
});

describe("formatUsage", () => {
  it("formats simple numbers", () => {
    expect(formatUsage(100, 500)).toBe("100 / 500");
  });

  it("formats with unit", () => {
    expect(formatUsage(5, 10, "GB")).toBe("5 / 10 GB");
  });

  it("formats zero values", () => {
    expect(formatUsage(0, 500)).toBe("0 / 500");
  });

  it("formats large numbers with locale separators", () => {
    const result = formatUsage(1234, 5000);
    expect(result).toContain("1");
    expect(result).toContain("234");
    expect(result).toContain("5");
    expect(result).toContain("000");
  });

  it("formats with string unit", () => {
    expect(formatUsage(3, 10, "users")).toBe("3 / 10 users");
  });
});
