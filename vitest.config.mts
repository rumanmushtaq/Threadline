import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // One shared test database: run files one after another (also keeps machine load low).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
