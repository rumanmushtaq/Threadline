import { expect, test } from "@playwright/test";

test("protected pages redirect anonymous visitors to login", async ({ page }) => {
  await page.goto("/products");
  await expect(page).toHaveURL(/\/login\?next=%2Fproducts/);
});

test("APIs refuse anonymous and unauthorised callers", async ({ request }) => {
  expect((await request.get("/api/notifications")).status()).toBe(401);
  expect((await request.get("/api/cron/worker")).status()).toBe(401);
  expect((await request.get("/api/cron/worker", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("file route blocks path traversal", async ({ request }) => {
  for (const path of ["/api/files/..%2F.env", "/api/files/products/..%2F..%2F.env", "/api/files/%2Fetc%2Fpasswd"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("unknown public products show the not-found page", async ({ page }) => {
  const res = await page.goto("/p/CLO-999999");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("This item isn't available")).toBeVisible();
});
