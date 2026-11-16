import "dotenv/config";

process.env.ARGON2_CHEAP = "1";
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
// Domain code that imports the shared `db` must hit the test database, never the dev one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.STORAGE_DRIVER = "local";
process.env.LOCAL_STORAGE_DIR = "./storage-test";
