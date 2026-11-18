import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { MAILPIT_URL } from "../scripts/local-supabase";

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

export const SHOPPER = { name: "Ayesha Khan", email: "ayesha@shopper.test", password: "shopper-pass-123" };

/** Waits for the newest email to `to` in the local mail catcher and returns its Supabase link. */
export async function emailLink(request: APIRequestContext, to: string) {
  let link = "";
  await expect(async () => {
    const list = await (await request.get(`${MAILPIT_URL}/api/v1/messages`)).json();
    const msg = list.messages.find((m: { To: { Address: string }[] }) => m.To[0].Address === to);
    expect(msg).toBeTruthy();
    const full = await (await request.get(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json();
    link = full.Text.match(/https?:\/\/\S+verify\S+/)[0];
  }).toPass({ timeout: 15_000 });
  return link;
}

/** Shop sign-up through the form, then the confirmation email link (ends signed in, back on `next`). */
export async function signUpShopper(page: Page, request: APIRequestContext, who = SHOPPER) {
  await page.getByLabel("Full name").fill(who.name);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByLabel("Confirm password").fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Almost done")).toBeVisible();
  await page.goto(await emailLink(request, who.email));
}

/** Shop sign-in with email + password. */
export async function shopLogin(page: Page, who: { email: string; password: string }, next = "/shop") {
  await page.goto(`/account/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password", { exact: true }).fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[/?]/g, "\\$&") + "$"));
}
