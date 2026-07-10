import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("CheckLabel", () => {
  it("exports CheckLabel as a function component", async () => {
    const mod = await import("@/components/CheckLabel");
    expect(mod).toHaveProperty("CheckLabel");
    expect(typeof mod.CheckLabel).toBe("function");
  });
});

describe("PasscodeGate", () => {
  it("exports PasscodeGate as a function component", async () => {
    const mod = await import("@/components/PasscodeGate");
    expect(mod).toHaveProperty("PasscodeGate");
    expect(typeof mod.PasscodeGate).toBe("function");
  });
});

describe("useAuth", () => {
  it("exports useAuth and isAuthenticated", async () => {
    const mod = await import("@/hooks/useAuth");
    expect(mod).toHaveProperty("useAuth");
    expect(typeof mod.useAuth).toBe("function");
    expect(mod).toHaveProperty("isAuthenticated");
    expect(typeof mod.isAuthenticated).toBe("function");
  });
});
