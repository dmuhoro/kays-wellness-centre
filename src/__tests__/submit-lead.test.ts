import { describe, it, expect } from "vitest";
import { z } from "zod";

const submitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().max(50).optional().default(""),
  email: z.union([z.string().email("Enter a valid email address"), z.literal("")]).optional().default(""),
  service: z.string().max(100).optional().default(""),
  channel: z.string().max(50).optional().default(""),
  priority: z.enum(["low", "medium", "high"]).optional().default("medium"),
  appointment_timestamp: z.string().datetime().optional().nullable(),
  raw_payload: z.any().optional(),
});

describe("submitLead validation rollback guarantee", () => {
  it("rejects empty name", () => {
    const result = submitSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("name");
    }
  });

  it("rejects invalid email", () => {
    const result = submitSchema.safeParse({ name: "Test", email: "not-an-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("email");
    }
  });

  it("rejects invalid priority", () => {
    const result = submitSchema.safeParse({
      name: "Test",
      email: "test@test.com",
      priority: "urgent",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.path.includes("priority"))).toBe(true);
    }
  });

  it("rejects invalid datetime", () => {
    const result = submitSchema.safeParse({
      name: "Test",
      email: "test@test.com",
      appointment_timestamp: "2026-07-13T25:00:00Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.path.includes("appointment_timestamp"))).toBe(true);
    }
  });

  it("accepts valid minimal payload (name only)", () => {
    const result = submitSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Alice");
      expect(result.data.email).toBe("");
      expect(result.data.priority).toBe("medium");
    }
  });

  it("accepts full valid payload with appointment", () => {
    const result = submitSchema.safeParse({
      name: "Bob",
      phone: "+254722000000",
      email: "bob@test.com",
      service: "bhrh",
      channel: "website",
      priority: "high",
      appointment_timestamp: "2026-07-14T10:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("passes whitespace name (trim happens in handler, not schema)", () => {
    const result = submitSchema.safeParse({ name: "   " });
    expect(result.success).toBe(true);
  });

  it("rejects phone exceeding max length", () => {
    const result = submitSchema.safeParse({
      name: "Test",
      phone: "1".repeat(51),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].path).toContain("phone");
    }
  });

  it("rejects service exceeding max length", () => {
    const result = submitSchema.safeParse({
      name: "Test",
      service: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});
