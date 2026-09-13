import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    passWithNoTests: false,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: { "@": root },
  },
});
