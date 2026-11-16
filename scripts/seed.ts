import "dotenv/config";
import { createDb } from "../src/server/db";
import { upsertAdmin } from "../src/server/users";

async function main() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Admin", DATABASE_URL } = process.env;
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD");
  if (ADMIN_PASSWORD.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const { db, close } = createDb(DATABASE_URL);
  try {
    await upsertAdmin(db, { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    console.log(`Admin account ready: ${ADMIN_EMAIL}`);
  } finally {
    await close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
