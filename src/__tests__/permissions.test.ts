import { describe, it, expect } from "vitest";
import { ROLES, roleAtLeast, canAccessFinance, canAccessDataExport, canDeleteData, canAccessAdminSettings } from "@/lib/permissions.server";

describe("ROLES constants", () => {
  it("defines SUPER_ADMIN", () => {
    expect(ROLES.SUPER_ADMIN).toBe("super_admin");
  });

  it("defines CLINIC_OWNER", () => {
    expect(ROLES.CLINIC_OWNER).toBe("admin");
  });

  it("defines CLINIC_STAFF", () => {
    expect(ROLES.CLINIC_STAFF).toBe("staff");
  });
});

describe("roleAtLeast", () => {
  it("returns true for super_admin checking super_admin", () => {
    expect(roleAtLeast("super_admin", ROLES.SUPER_ADMIN)).toBe(true);
  });

  it("returns true for super_admin checking clinic_owner", () => {
    expect(roleAtLeast("super_admin", ROLES.CLINIC_OWNER)).toBe(true);
  });

  it("returns true for admin checking clinic_staff", () => {
    expect(roleAtLeast("admin", ROLES.CLINIC_STAFF)).toBe(true);
  });

  it("returns false for staff checking admin", () => {
    expect(roleAtLeast("staff", ROLES.CLINIC_OWNER)).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(roleAtLeast("unknown", ROLES.CLINIC_OWNER)).toBe(false);
  });
});

describe("canAccessFinance", () => {
  it("allows super_admin", () => {
    expect(canAccessFinance("super_admin")).toBe(true);
  });

  it("allows admin", () => {
    expect(canAccessFinance("admin")).toBe(true);
  });

  it("denies staff", () => {
    expect(canAccessFinance("staff")).toBe(false);
  });

  it("denies null", () => {
    expect(canAccessFinance(null)).toBe(false);
  });
});

describe("canAccessDataExport", () => {
  it("allows super_admin", () => {
    expect(canAccessDataExport("super_admin")).toBe(true);
  });

  it("allows admin", () => {
    expect(canAccessDataExport("admin")).toBe(true);
  });

  it("denies staff", () => {
    expect(canAccessDataExport("staff")).toBe(false);
  });
});

describe("canDeleteData", () => {
  it("allows super_admin", () => {
    expect(canDeleteData("super_admin")).toBe(true);
  });

  it("denies staff", () => {
    expect(canDeleteData("staff")).toBe(false);
  });
});

describe("canAccessAdminSettings", () => {
  it("allows admin", () => {
    expect(canAccessAdminSettings("admin")).toBe(true);
  });

  it("denies staff", () => {
    expect(canAccessAdminSettings("staff")).toBe(false);
  });
});
