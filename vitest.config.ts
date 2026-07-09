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
    env: {
      TZ: "UTC",
    },
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
