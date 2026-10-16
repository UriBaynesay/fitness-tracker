import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile("../.env");
} catch {
  // No .env: tests fall back to the defaults in test/helpers.ts.
}

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    // Every test file shares one real database, so files must not run in parallel.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
