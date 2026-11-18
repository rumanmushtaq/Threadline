import { expect, test } from "@playwright/test";
import { localSupabaseKeys, MAILPIT_URL, TEST_SUPABASE_URL } from "../scripts/local-supabase";
import { ADMIN, emailLink, shopLogin, signUpShopper, STAFF } from "./fixtures";

// Runs after flow.spec.ts, which publishes CLO-000001 and signs up SHOPPER.
const BILAL = { name: "Bilal Ahmed", email: "bilal@shopper.test", password: "bilal-pass-1234" };

test.beforeAll(async ({ request }) => {
  await request.delete(`${MAILPIT_URL}/api/v1/messages`);
});

test("visitors browse everything without an account, but their account page needs sign-in", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByRole("heading", { name: "Shop" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Search products").fill("navy");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=navy/);
  await expect(page.getByRole("link", { name: /Navy Oversized Cotton Tee/ })).toBeVisible();
  await page.getByLabel("Search products").fill("no-such-thing");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account\/login\?next=(%2F|\/)account$/);
  await page.goto("/account/reset-password");
  await expect(page).toHaveURL(/\/account\/login\?error=link/);
});

test("sign-up: confirm by email, then sign out and back in", async ({ page, request }) => {
  await page.goto("/account/signup?next=%2Fshop");
  await signUpShopper(page, request, BILAL);
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("link", { name: "Bilal" })).toBeVisible();

  await page.goto("/account");
  await expect(page.getByText("No orders yet.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await shopLogin(page, BILAL, "/account");
  await expect(page.getByRole("heading", { name: "My orders" })).toBeVisible();
});

test("wrong passwords, unknown emails and too many guesses are refused", async ({ page }) => {
  await page.goto("/account/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
  for (const [email, password] of [
    [BILAL.email, "wrong-password-1"],
    ["nobody@shopper.test", "whatever-123"],
  ]) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  }
  for (let i = 0; i < 4; i++) {
    await page.getByLabel("Password", { exact: true }).fill(`guess-${i}-xyz`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("p[role=alert]")).toBeVisible();
  }
  // Five wrong passwords for this email from this connection: the sixth try is locked, even if right.
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many failed attempts. Try again in 15 minutes.")).toBeVisible();
});

test("a team account cannot sign in on the shop, and a shopper cannot use the team login", async ({ page }) => {
  await page.goto("/account/login");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password", { exact: true }).fill(STAFF.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This is a team account. Sign in on the team page instead.")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill("ayesha@shopper.test");
  await page.getByLabel("Password").fill("shopper-pass-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("signing up again with a registered email reveals nothing", async ({ page }) => {
  await page.goto("/account/signup");
  await page.getByLabel("Full name").fill("Someone Else");
  await page.getByLabel("Email").fill("ayesha@shopper.test");
  await page.getByLabel("Password", { exact: true }).fill("another-pass-123");
  await page.getByLabel("Confirm password").fill("another-pass-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Almost done")).toBeVisible();
});

test("an unconfirmed email cannot sign in, and a broken link is explained", async ({ page }) => {
  await page.goto("/account/signup");
  await page.getByLabel("Full name").fill("Hira Malik");
  await page.getByLabel("Email").fill("hira@shopper.test");
  await page.getByLabel("Password", { exact: true }).fill("hira-pass-1234");
  await page.getByLabel("Confirm password").fill("hira-pass-1234");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Almost done")).toBeVisible();
  await page.goto("/account/login");
  await page.getByLabel("Email").fill("hira@shopper.test");
  await page.getByLabel("Password", { exact: true }).fill("hira-pass-1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Confirm your email first: open the link we sent you.")).toBeVisible();

  await page.goto("/auth/confirm?code=forged-code&next=%2Fshop");
  await expect(page).toHaveURL(/\/account\/login\?error=link/);
  await expect(page.getByText("That link has expired or was already used.")).toBeVisible();
  await page.goto("/auth/confirm?token_hash=forged&type=signup&next=%2Fshop");
  await expect(page).toHaveURL(/\/account\/login\?error=link/);
});

test("forgot password for a shopper: link once, new password works, old one doesn't", async ({ page, request, browser }) => {
  await page.goto("/account/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/account\/forgot-password/);
  await page.getByLabel("Email").fill(BILAL.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/)).toBeVisible();

  let link = "";
  await expect(async () => {
    link = await emailLink(request, BILAL.email);
    expect(decodeURIComponent(link)).toContain("/account/reset-password");
  }).toPass({ timeout: 20_000 });
  await page.goto(link);
  await expect(page).toHaveURL(/\/account\/reset-password$/);
  await page.getByLabel("New password", { exact: true }).fill("bilal-new-pass-99");
  await page.getByLabel("Confirm new password").fill("bilal-new-pass-99");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/account$/);

  const other = await (await browser.newContext()).newPage();
  await other.goto(link);
  await expect(other).toHaveURL(/error=link/);
  await other.goto("/account/login");
  await other.getByLabel("Email").fill(BILAL.email);
  await other.getByLabel("Password", { exact: true }).fill(BILAL.password);
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByText("Email or password is incorrect.")).toBeVisible();
  await shopLogin(other, { email: BILAL.email, password: "bilal-new-pass-99" }, "/account");
});

test("account details are checked and saved", async ({ page }) => {
  await shopLogin(page, { email: BILAL.email, password: "bilal-new-pass-99" }, "/account");
  await page.getByLabel("Phone number").fill("12");
  await page.getByLabel("Delivery address").fill("short");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText(/Enter a valid phone number/)).toBeVisible();
  await expect(page.getByText("Enter your full delivery address")).toBeVisible();
  await page.getByLabel("Phone number").fill("0321 7654321");
  await page.getByLabel("Delivery address").fill("Flat 3, Block B, Clifton");
  await page.getByLabel("City").fill("Karachi");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("City")).toHaveValue("Karachi");

  // The saved details fill the order form on any product.
  await page.goto("/p/CLO-000001");
  await page.getByRole("button", { name: /Order Now/ }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Phone number")).toHaveValue("03217654321");
  await expect(sheet.getByLabel("City")).toHaveValue("Karachi");
});

test("Continue with Google sends the browser to Google with this shop's return address", async ({ page }) => {
  let googleUrl = "";
  // Read Supabase's redirect to Google without leaving the test machine.
  await page.route("http://127.0.0.1:54331/auth/v1/authorize**", async (route) => {
    const res = await route.fetch({ maxRedirects: 0 });
    googleUrl = res.headers()["location"];
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google</h1>" });
  });
  await page.goto("/account/signup?next=%2Fp%2FCLO-000001");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Google" })).toBeVisible();
  const url = new URL(googleUrl);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("client_id")).toBe("local-placeholder.apps.googleusercontent.com");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54331/auth/v1/callback");
  const login = await page.context().cookies();
  expect(login.some((c) => c.name.endsWith("-code-verifier") && c.httpOnly)).toBe(true);
});

test("one reset-email template for everyone: each person lands on their own reset page", async ({ browser, request }) => {
  // What Supabase's recommended template link looks like: token_hash + type, no destination.
  const tokenFor = async (email: string) => {
    const key = localSupabaseKeys().secretKey;
    const res = await request.post(`${TEST_SUPABASE_URL}/auth/v1/admin/generate_link`, {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      data: { type: "recovery", email },
    });
    return (await res.json()).hashed_token as string;
  };
  for (const [email, page] of [
    [BILAL.email, /\/account\/reset-password$/],
    [ADMIN.email, /\/reset-password$/],
  ] as const) {
    const ctx = await browser.newContext();
    const tab = await ctx.newPage();
    await tab.goto(`/auth/confirm?token_hash=${await tokenFor(email)}&type=recovery`);
    await expect(tab).toHaveURL(page);
    if (email === ADMIN.email) await expect(tab).not.toHaveURL(/\/account\//);
    await ctx.close();
  }
});
