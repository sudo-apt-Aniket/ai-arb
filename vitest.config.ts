import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    external: ["node:sqlite", "sqlite"]
  },
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [["tests/api.test.ts", "node"]],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
