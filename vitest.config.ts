import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      TZ: "UTC",
    },
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});