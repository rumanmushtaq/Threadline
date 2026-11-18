import "dotenv/config";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { localSupabaseKeys, TEST_SUPABASE_URL } from "./scripts/local-supabase";

const PORT = 3300;
// End-to-end tests wipe their database. Refuse to start unless it is clearly the test database.
const TEST_DB = process.env.TEST_DATABASE_URL;
const isTestDb = (u?: string): u is string => !!u && /(^|[_-])test($|[_-])/i.test(new URL(u).pathname.replace(/^\//, ""));
if (!isTestDb(TEST_DB) || TEST_DB === process.env.DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a separate database named like *_test before running e2e tests.");
}
// Reuse an already-downloaded Chromium when the exact build for this Playwright version is missing.
const localChromium = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: localChromium && existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Production build: fast pages and real behaviour (dev mode compiles each page on first visit).
    // E2E_SKIP_BUILD=1 reuses an existing .next-e2e build (e.g. built earlier to spread memory use).
    command: process.env.E2E_SKIP_BUILD ? `pnpm next start -p ${PORT}` : `pnpm next build && pnpm next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 420_000,
    reuseExistingServer: false,
    env: {
      // End-to-end tests run against the test database, never the dev one.
      DATABASE_URL: TEST_DB,
      STORAGE_DRIVER: "local",
      LOCAL_STORAGE_DIR: "./storage-e2e",
      APP_URL: `http://localhost:${PORT}`,
      // Local Supabase Auth test server (docker compose), which uses the test database.
      SUPABASE_URL: TEST_SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: localSupabaseKeys().publishableKey,
      SUPABASE_SECRET_KEY: localSupabaseKeys().secretKey,
      AI_IMAGE_PROVIDER: "gemini",
      GEMINI_API_KEY: "",
      NEXT_DIST_DIR: ".next-e2e",
      NODE_OPTIONS: "--max-old-space-size=1536",
    },
  },
});
