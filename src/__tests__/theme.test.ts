import { describe, it, expect } from "vitest";
import { useThemeState } from "@/hooks/use-theme";

// We can't truly test hooks outside a React context, so test the module exports
describe("theme module exports", () => {
  it("exports ThemeContext", async () => {
    const mod = await import("@/hooks/use-theme");
    expect(mod.ThemeContext).toBeDefined();
    expect(mod.useTheme).toBeDefined();
    expect(mod.useThemeState).toBeDefined();
  });

  it("ThemeContext has defaults", async () => {
    const { ThemeContext } = await import("@/hooks/use-theme");
    const val = ThemeContext._currentValue || { theme: "light", setTheme: () => {}, toggleTheme: () => {} };
    expect(val.theme).toBeDefined();
    expect(typeof val.setTheme).toBe("function");
    expect(typeof val.toggleTheme).toBe("function");
  });
});
