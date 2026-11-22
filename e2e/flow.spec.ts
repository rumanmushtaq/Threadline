import { expect, test } from "@playwright/test";
import { ADMIN, login, PHOTO, SHOPPER, signUpShopper, STAFF } from "./fixtures";
import { MAILPIT_URL } from "../scripts/local-supabase";

// One story, in order: staff creates a product, a customer orders it, the admin delivers it.
test.describe.configure({ mode: "serial" });

let productUrl = "";

test("rejects wrong passwords", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

test("staff creates a product with the six-step form", async ({ page }) => {
  await login(page, STAFF);
  await page.goto("/products/new");

  // Saving an empty form shows errors and keeps the user on the page.
  await page.getByRole("button", { name: "Save Product" }).click();
  await expect(page.getByText("Upload a product picture first.")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByAltText("Product preview")).toBeVisible();

  await page.getByLabel("Pieces").fill("45");
  await page.getByLabel("Product name").fill("Navy Oversized Cotton Tee");
  await page.getByLabel("Description").fill("Premium quality cotton T-shirt with a modern oversized fit and soft fabric.");

  // Sizes follow the chosen group.
  await page.getByRole("radio", { name: /Kids/ }).click();
  await expect(page.locator("#size-XS")).toBeVisible();
  await expect(page.locator("#size-XL")).toHaveCount(0);
  await page.getByRole("radio", { name: /Adult/ }).click();
  await expect(page.locator("#size-XS")).toHaveCount(0);
  await expect(page.locator("#size-XL")).toBeVisible();

  await page.locator("#size-M").fill("10");
  await page.locator("#size-L").fill("20");
  await page.locator("#size-XL").fill("10");
  await expect(page.getByText("5 left to assign")).toBeVisible();

  await page.locator("#purchasePrice").fill("800");
  await page.locator("#sellingPrice").fill("1500");
  await expect(page.getByText("Rs. 700", { exact: true })).toBeVisible();
  await expect(page.getByText("46.7%")).toBeVisible();

  // Sizes add up to 40, not 45: the save is refused.
  await page.getByRole("button", { name: "Save Product" }).click();
  await expect(page.getByText("Size quantities add up to 40, but the total is 45")).toBeVisible();

  await page.locator("#size-XL").fill("15");
  await expect(page.getByText("Rs. 31,500")).toBeVisible();
  await page.getByRole("button", { name: "Save Product" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Product saved")).toBeVisible();
  await expect(dialog.getByText("CLO-000001", { exact: true })).toBeVisible();
  await expect(dialog.getByText("/p/CLO-000001")).toBeVisible();
  await dialog.getByRole("link", { name: /View product/ }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);
  productUrl = new URL(page.url()).pathname;

  await expect(page.getByText("45 on hand · 0 reserved · 45 available · 0 sold")).toBeVisible();
  // Staff cannot edit or archive.
  await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Archive/ })).toHaveCount(0);
});

test("staff cannot reach admin areas", async ({ page }) => {
  await login(page, STAFF);
  const nav = page.getByRole("navigation").or(page.locator("[data-sidebar=content]"));
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Orders" })).toHaveCount(0);
  for (const path of ["/users", "/orders", "/customers", "/activity", `${productUrl}/edit`]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  }
  // Settings shows only the account section.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toHaveCount(0);
});

test("staff can add stock but not remove it", async ({ page }) => {
  await login(page, STAFF);
  await page.goto(productUrl);
  await page.getByRole("button", { name: "Update stock" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab")).toHaveCount(0); // only "Add stock" is available
  await dialog.locator("#mv-M").fill("5");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("50 on hand · 0 reserved · 50 available · 0 sold")).toBeVisible();
});

test("customer browses without an account, signs up to order, and follows the order", async ({ page, request }) => {
  const html = await (await request.get("/p/CLO-000001")).text();
  for (const secret of ["80000", "Rs. 800", "purchase", "unitCost", "Staff Person", "staff@e2e.test"]) {
    expect(html, `public page must not contain ${secret}`).not.toContain(secret);
  }
  await request.delete(`${MAILPIT_URL}/api/v1/messages`);

  // The front door and the shop are open to everyone.
  await page.goto("/");
  await expect(page).toHaveURL(/\/shop$/);
  await page.getByRole("link", { name: /Navy Oversized Cotton Tee/ }).click();
  await expect(page).toHaveURL(/\/p\/CLO-000001$/);

  await page.goto("/p/clo-000001"); // links are case-insensitive
  await expect(page.getByRole("heading", { name: "Navy Oversized Cotton Tee" })).toBeVisible();
  await expect(page.getByText("Rs. 1,500").first()).toBeVisible();
  await page.getByRole("button", { name: /Order Now/ }).first().click();

  // Ordering needs a shopper account: sign up (form checks first), confirm by email, come back.
  await expect(page).toHaveURL(/\/account\/login\?next=%2Fp%2FCLO-000001&reason=order/);
  await expect(page.getByText("Sign in or create an account to place your order.")).toBeVisible();
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password").fill("different");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await signUpShopper(page, request);
  await expect(page).toHaveURL(/\/p\/CLO-000001$/);
  await expect(page.getByRole("link", { name: "Ayesha" })).toBeVisible();

  await page.getByRole("radio", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await page.getByRole("button", { name: /Order Now · Rs. 3,000/ }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByLabel("Full name")).toHaveValue("Ayesha Khan"); // from the account
  await sheet.getByRole("button", { name: "Place order" }).click();
  await expect(sheet.getByText(/Enter a valid phone number/)).toBeVisible();
  await sheet.getByLabel("Phone number").fill("0300 1234567");
  await sheet.getByLabel("Delivery address").fill("short");
  await sheet.getByRole("button", { name: "Place order" }).click();
  await expect(sheet.getByText("Enter your full delivery address")).toBeVisible();
  await sheet.getByLabel("Delivery address").fill("House 12, Street 4, Gulberg III");
  await sheet.getByLabel("City").fill("Lahore");
  await sheet.getByRole("button", { name: "Place order" }).click();
  await expect(sheet.getByText("Order placed")).toBeVisible();
  await expect(sheet.getByText("ORD-000001")).toBeVisible();
  await expect(sheet.getByText("Rs. 3,000")).toBeVisible();

  // The order shows in the shopper's account, and the delivery details are remembered.
  await sheet.getByRole("link", { name: "Track in my orders" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText("ORD-000001")).toBeVisible();
  await expect(page.getByText("Navy Oversized Cotton Tee · L × 2")).toBeVisible();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phone number")).toHaveValue("03001234567");
  await expect(page.getByLabel("City")).toHaveValue("Lahore");

  // A shopper account never opens the team area.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  void SHOPPER;
});

test("admin is notified and moves the order to delivered", async ({ page }) => {
  await login(page, ADMIN);
  await expect(page.getByRole("button", { name: /Notifications \(1 unread\)/ })).toBeVisible();

  await page.goto("/orders");
  await page.getByRole("link", { name: "ORD-000001" }).click();
  await expect(page.getByText("stock reserved")).toBeVisible();

  for (const [button, status] of [
    ["Confirm", "Confirmed"],
    ["Dispatch", "Dispatched"],
    ["Mark delivered", "Delivered"],
  ] as const) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: button, exact: true }).click();
    await expect(page.locator("h1").locator("..").getByText(status, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Realized profit")).toBeVisible();

  await page.goto(productUrl);
  await expect(page.getByText("48 on hand · 0 reserved · 48 available · 2 sold")).toBeVisible();
  await expect(page.getByText("Sold (delivered)")).toBeVisible();

  await page.goto("/dashboard");
  // The delivered order counts as a website sale on the money cards.
  await expect(page.getByText("1 delivered order · profit Rs. 1,400")).toBeVisible();
});

test("admin unpublishes the product and the public link stops working", async ({ page, request }) => {
  await login(page, ADMIN);
  await page.goto(productUrl);
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
  expect((await request.get("/p/CLO-000001")).status()).toBe(404);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  expect((await request.get("/p/CLO-000001")).status()).toBe(200);
});

test("admin manages the four accounts", async ({ page }) => {
  await login(page, ADMIN);
  await page.goto("/users");
  await expect(page.getByText("2 of 4 accounts in use")).toBeVisible();
  for (const n of [2, 3]) {
    await page.getByRole("button", { name: /Add User/ }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Full name").fill(`Extra ${n}`);
    await d.getByLabel("Email").fill(`extra${n}@e2e.test`);
    await d.getByLabel("Temporary password").fill("extra-pass-123");
    await d.getByRole("button", { name: "Create account" }).click();
    await expect(d).toBeHidden();
  }
  await expect(page.getByText("4 of 4 accounts in use")).toBeVisible();
  await expect(page.getByRole("button", { name: /Add User/ })).toHaveCount(0);
});
