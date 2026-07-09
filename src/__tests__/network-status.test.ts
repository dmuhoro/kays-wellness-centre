import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("NetworkStatus component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports NetworkStatus as a function component", async () => {
    const mod = await import("@/components/NetworkStatus");
    expect(mod).toHaveProperty("NetworkStatus");
    expect(typeof mod.NetworkStatus).toBe("function");
  });
});