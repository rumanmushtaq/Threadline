import { mkdir, rm, writeFile } from "node:fs/promises";
import "dotenv/config";
import { pointAtTestSupabase } from "../scripts/local-supabase";

/** Fresh test database with one admin and one staff account, plus a product photo. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/(^|[_-])test($|[_-])/i.test(new URL(url).pathname.replace(/^\//, ""))) throw new Error("TEST_DATABASE_URL must point at a *_test database");
  // Accounts live in the local Supabase Auth test server, never a real project.
  pointAtTestSupabase();
  const { resetDb, db, testDb } = await import("../tests/helpers");
  const { upsertAdmin, createStaffUser } = await import("../src/server/users");
  const sharp = (await import("sharp")).default;

  await resetDb();
  const admin = await upsertAdmin(db, { name: "Admin Person", email: "admin@e2e.test", password: "admin-pass-123" });
  await createStaffUser(db, admin.id, { name: "Staff Person", email: "staff@e2e.test", password: "staff-pass-123" });
  await testDb.close();

  await rm("./storage-e2e", { recursive: true, force: true });
  await mkdir("e2e/.tmp", { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#efe9e1"/><path d="M250 150 L550 150 L720 300 L640 380 L580 330 L580 850 L220 850 L220 330 L160 380 L80 300 Z" fill="#1f3a5f"/></svg>`;
  await writeFile("e2e/.tmp/navy-tee.jpg", await sharp(Buffer.from(svg)).jpeg().toBuffer());
  await writeFile("e2e/.tmp/not-image.jpg", "this is not an image");
}
