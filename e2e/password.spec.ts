import { expect, test } from "@playwright/test";
import { MAILPIT_URL } from "../scripts/local-supabase";
import { emailLink, login, STAFF } from "./fixtures";

const NEW_PASSWORD = "reset-by-email-123";

test("forgot password: email link, new password, then changed back in settings", async ({ page, request, browser }) => {
  await request.delete(`${MAILPIT_URL}/api/v1/messages`);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  const link = await emailLink(request, STAFF.email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByText(`For ${STAFF.email}`)).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Confirm new password").fill("something-else-1");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // The link works once only.
  const other = await browser.newContext();
  const second = await other.newPage();
  await second.goto(link);
  await expect(second).toHaveURL(/\/forgot-password\?error=expired/);

  // The old password no longer works; the new one does.
  await second.goto("/login");
  await second.getByLabel("Email").fill(STAFF.email);
  await second.getByLabel("Password").fill(STAFF.password);
  await second.getByRole("button", { name: "Sign in" }).click();
  await expect(second.getByText("Email or password is incorrect.")).toBeVisible();
  await login(second, { email: STAFF.email, password: NEW_PASSWORD });

  // Put the original password back from Settings → Your account (the other device is signed out).
  await page.goto("/settings");
  await page.getByLabel("Current password").fill(NEW_PASSWORD);
  await page.getByLabel("New password", { exact: true }).fill(STAFF.password);
  await page.getByLabel("Confirm new password").fill(STAFF.password);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/settings/);
  await second.goto("/dashboard");
  await expect(second).toHaveURL(/\/login/);
  await other.close();
});

test("the reset page without a valid link sends you to ask for a new one", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=expired/);
  await page.goto("/auth/confirm?code=not-a-real-code&next=%2Freset-password");
  await expect(page).toHaveURL(/\/forgot-password\?error=expired/);
});

test("signing out ends the session on the server, not just in the browser", async ({ page, browser }) => {
  await login(page, STAFF);
  const cookies = await page.context().cookies();
  const auth = cookies.filter((c) => c.name.startsWith("sb-"));
  expect(auth.length).toBeGreaterThan(0);
  expect(auth.every((c) => c.httpOnly)).toBe(true);

  await page.getByRole("button", { name: /Staff Person/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  // Someone who copied the cookies before sign-out gets nothing.
  const copy = await browser.newContext();
  await copy.addCookies(auth);
  const stolen = await copy.newPage();
  await stolen.goto("/dashboard");
  await expect(stolen).toHaveURL(/\/login/);
  await copy.close();
});
