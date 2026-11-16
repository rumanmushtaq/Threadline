import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@e2e.test", password: "admin-pass-123" };
export const STAFF = { email: "staff@e2e.test", password: "staff-pass-123" };
export const PHOTO = "e2e/.tmp/navy-tee.jpg";

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
