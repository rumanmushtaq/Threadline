import "dotenv/config";
import { pointAtTestSupabase } from "../scripts/local-supabase";

const isTestDb = (u?: string): u is string => !!u && /(^|[_-])test($|[_-])/i.test(new URL(u).pathname.replace(/^\//, ""));
// Tests wipe their database: refuse anything that is not clearly a separate test database.
if (!isTestDb(process.env.TEST_DATABASE_URL) || process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must be a separate database named like *_test");
}
// Domain code that imports the shared `db` must hit the test database, never the dev one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "./storage-test";
// AI counts as set up, with dummy keys: no test calls a real image service (worker tests use a stub).
process.env.AI_IMAGE_PROVIDER = "cloudflare";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_API_TOKEN = "test-token";
// Accounts are created and checked by the local Supabase Auth test server, never a real project.
pointAtTestSupabase();
