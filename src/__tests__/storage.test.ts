import { describe, it, expect } from "vitest";
import { validateFileType, generateStoragePath } from "@/lib/storage.server";

describe("validateFileType", () => {
  it("accepts image", () => {
    expect(() => validateFileType("image")).not.toThrow();
  });

  it("accepts document", () => {
    expect(() => validateFileType("document")).not.toThrow();
  });

  it("accepts diagnostic", () => {
    expect(() => validateFileType("diagnostic")).not.toThrow();
  });

  it("rejects invalid type", () => {
    expect(() => validateFileType("video")).toThrow("Invalid file type");
  });

  it("rejects empty string", () => {
    expect(() => validateFileType("")).toThrow("Invalid file type");
  });
});

describe("generateStoragePath", () => {
  it("generates org-isolated path", () => {
    const path = generateStoragePath("org-abc-123", "image", "photo.jpg");
    expect(path).toMatch(/^org-org-abc-123\/image\/[a-f0-9-]+\.jpg$/);
  });

  it("generates path without extension when filename has none", () => {
    const path = generateStoragePath("1", "document", "report");
    expect(path).toMatch(/^org-1\/document\/[a-f0-9-]+$/);
  });

  it("generates unique paths on successive calls", () => {
    const a = generateStoragePath("1", "image", "a.jpg");
    const b = generateStoragePath("1", "image", "a.jpg");
    expect(a).not.toBe(b);
  });

  it("uses org- prefix for isolation", () => {
    const path = generateStoragePath("xyz", "diagnostic", "scan.pdf");
    expect(path).toMatch(/^org-xyz\/diagnostic\/[a-f0-9-]+\.pdf$/);
  });

  it("throws for invalid file type", () => {
    expect(() => generateStoragePath("1", "video", "clip.mp4")).toThrow("Invalid file type");
  });
});
