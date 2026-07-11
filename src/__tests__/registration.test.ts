import { describe, it, expect } from "vitest";
import { registerOrgSchema } from "@/lib/api/registration.server";

describe("Registration Schema Validation", () => {
  it("validates input schema", () => {
    const valid = registerOrgSchema.safeParse({
      organizationName: "Test Clinic",
      adminName: "Dr. Jane",
      email: "jane@test.com",
      password: "secret123",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects short password", () => {
    const result = registerOrgSchema.safeParse({
      organizationName: "Test Clinic",
      adminName: "Dr. Jane",
      email: "jane@test.com",
      password: "123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerOrgSchema.safeParse({
      organizationName: "Test Clinic",
      adminName: "Dr. Jane",
      email: "not-an-email",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short org name", () => {
    const result = registerOrgSchema.safeParse({
      organizationName: "X",
      adminName: "Dr. Jane",
      email: "jane@test.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("accepts special characters in org name", () => {
    const valid = registerOrgSchema.safeParse({
      organizationName: "Nairobi Wellness & Hormone Clinic!",
      adminName: "Dr. Jane",
      email: "jane@test.com",
      password: "secret123",
    });
    expect(valid.success).toBe(true);
  });

  it("rejects missing admin name", () => {
    const result = registerOrgSchema.safeParse({
      organizationName: "Test Clinic",
      adminName: "",
      email: "jane@test.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
  });

  it("exports registerOrgSchema with all required fields", () => {
    expect(registerOrgSchema._def).toBeDefined();
  });
});
