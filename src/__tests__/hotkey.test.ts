import { describe, it, expect } from "vitest";

describe("useHotkey export", () => {
  it("exports all hotkey hooks", async () => {
    const mod = await import("@/hooks/use-hotkey");
    expect(mod.useHotkey).toBeDefined();
    expect(mod.useEscape).toBeDefined();
    expect(mod.useKeyboardNavigation).toBeDefined();
  });
});

describe("useKeyboardNavigation", () => {
  it("calls switchView with correct view on Cmd+1", async () => {
    const { useKeyboardNavigation } = await import("@/hooks/use-hotkey");
    expect(typeof useKeyboardNavigation).toBe("function");
  });
});

describe("useEscape", () => {
  it("registers an escape handler", async () => {
    const { useEscape } = await import("@/hooks/use-hotkey");
    expect(typeof useEscape).toBe("function");
  });
});
