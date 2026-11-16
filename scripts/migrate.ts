import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { pgConnection } from "../src/server/db/ssl";

// Migrations use a plain TCP connection; Neon accepts these too.
export async function runMigrations(url: string) {
  const pool = new Pool({ ...pgConnection(url), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  // Poolers in transaction mode (Supabase port 6543) are fine for the app; migrations use the direct URL.
  const url =
    process.argv[2] === "--test"
      ? process.env.TEST_DATABASE_URL
      : process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL is not set");
  runMigrations(url)
    .then(() => console.log("Migrations applied"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
