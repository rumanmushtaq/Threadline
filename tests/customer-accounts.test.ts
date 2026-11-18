import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MAILPIT_URL } from "../scripts/local-supabase";
import { login } from "@/server/auth/login";
import { requestPasswordReset } from "@/server/auth/recovery";
import { resolveSession } from "@/server/auth/session";
import { customerDetailsSchema } from "@/lib/validation/customer";
import {
  customerSignUpSchema,
  googleSignInUrl,
  setCustomerPassword,
  listCustomerOrders,
  loginCustomer,
  resolveCustomer,
  signUpCustomer,
} from "@/server/customer-accounts";
import { customerAccounts, orders } from "@/server/db/schema";
import { placeOrder } from "@/server/orders";
import { createProduct } from "@/server/products";
import { supabaseAdmin } from "@/server/supabase/clients";
import { createStaffUser } from "@/server/users";
import { browser, db, forgedCopyOf, productInput, resetDb, seedUsers, testDb, testImage } from "./helpers";

const APP = "http://localhost:3300";
let ip = 0;
const meta = () => ({ ip: `10.50.0.${++ip}`, appUrl: APP, next: "/shop" });
const SHOPPER = { name: "Ayesha Khan", email: "ayesha@shop.test", password: "shopper-pass-1" };

beforeEach(async () => {
  await resetDb();
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
});
afterAll(() => testDb.close());

async function linkFor(to: string) {
  for (let i = 0; i < 30; i++) {
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as { messages: { ID: string; To: { Address: string }[] }[] };
    const msg = list.messages.find((m) => m.To[0].Address === to);
    if (msg) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      return full.Text.match(/https?:\/\/\S+verify\S+/)![0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no email to ${to}`);
}

/** Signs a shopper up and opens the confirmation link in the same browser. */
async function signedUpShopper(who = SHOPPER) {
  const b = browser();
  expect(await signUpCustomer(db, b.supabase, who, meta())).toBe("check_email");
  const res = await fetch(await linkFor(who.email), { redirect: "manual" });
  const back = new URL(res.headers.get("location")!);
  expect(back.origin + back.pathname).toBe(`${APP}/auth/confirm`);
  expect((await b.supabase.auth.exchangeCodeForSession(back.searchParams.get("code")!)).error).toBeNull();
  return b;
}

/** A shopper with a confirmed email (made directly, so no confirmation email is sent). */
async function confirmedShopper(who = SHOPPER) {
  await supabaseAdmin().createUser({ email: who.email, password: who.password, email_confirm: true, user_metadata: { name: who.name } });
  return loginCustomer(db, browser().supabase, who, { ip: `10.61.0.${++ip}` });
}

describe("shopper accounts", () => {
  it("sign up with email: confirm link signs in and creates the shopper account", async () => {
    const b = await signedUpShopper();
    const account = await resolveCustomer(db, b.supabase);
    expect(account).toMatchObject({ name: "Ayesha Khan", email: SHOPPER.email, phone: null });
  });

  it("an unconfirmed email cannot sign in yet", async () => {
    await signUpCustomer(db, browser().supabase, SHOPPER, meta());
    await expect(loginCustomer(db, browser().supabase, SHOPPER, { ip: "10.60.0.1" })).rejects.toThrow(/Confirm your email/);
  });

  it("shoppers and the team are kept apart in both directions", async () => {
    await seedUsers();
    await signedUpShopper();
    // A shopper signs in on the shop, but the team login and team pages refuse them.
    const shop = browser();
    await loginCustomer(db, shop.supabase, SHOPPER, { ip: "10.60.0.2" });
    expect(await resolveCustomer(db, shop.supabase)).toBeTruthy();
    expect(await resolveSession(db, shop.supabase)).toBeNull();
    await expect(login(db, browser().supabase, SHOPPER, { ip: "10.60.0.3" })).rejects.toThrow(/incorrect/);
    // A team member is not a shopper: the shop login sends them away and leaves no session.
    const staff = browser();
    await expect(loginCustomer(db, staff.supabase, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.60.0.4" })).rejects.toThrow(/team account/);
    expect(staff.jar.size).toBe(0);
  });

  it("the admin cannot take over a shopper's email for a team account", async () => {
    const { adminId } = await seedUsers();
    await signedUpShopper();
    await expect(createStaffUser(db, adminId, { name: "Taken", email: SHOPPER.email, password: "password-123" })).rejects.toThrow(/already used/);
    await expect(loginCustomer(db, browser().supabase, SHOPPER, { ip: "10.60.0.5" })).resolves.toBeTruthy();
  });

  it("orders are linked to the shopper, details are remembered, and each shopper sees only their own orders", async () => {
    const { staffId } = await seedUsers();
    const p = await createProduct(db, staffId, productInput(), await testImage());
    const a = await resolveCustomer(db, (await signedUpShopper()).supabase);
    const b = await resolveCustomer(db, (await signedUpShopper({ name: "Bilal", email: "bilal@shop.test", password: "shopper-pass-2" })).supabase);
    const order = { slug: p.slug, size: "M", quantity: 2, customerName: "Ayesha Khan", phone: "0300 1234567", whatsapp: "", address: "House 12, Street 4, Gulberg III", city: "Lahore", notes: "" };
    await placeOrder(db, order, { ip: "10.70.0.1", customerAccountId: a!.id });

    const [saved] = await db.select().from(customerAccounts).where(eq(customerAccounts.id, a!.id));
    expect(saved).toMatchObject({ phone: "03001234567", address: "House 12, Street 4, Gulberg III", city: "Lahore" });
    const mine = await listCustomerOrders(db, a!.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ status: "pending", items: [{ productName: "Oversized Cotton Tee", size: "M", quantity: 2 }] });
    expect(JSON.stringify(mine)).not.toMatch(/cost|purchase/i);
    expect(await listCustomerOrders(db, b!.id)).toEqual([]);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.customerAccountId, a!.id));
    expect(n).toBe(1);
  });

  it("Continue with Google starts at Google with this app's return address", async () => {
    const b = browser();
    const url = await googleSignInUrl(b.supabase, { appUrl: APP, next: "/p/CLO-000001" });
    const res = await fetch(url, { redirect: "manual" });
    const google = new URL(res.headers.get("location")!);
    expect(google.origin).toBe("https://accounts.google.com");
    expect(google.searchParams.get("client_id")).toBe("local-placeholder.apps.googleusercontent.com");
    // The code verifier stays in this browser, so only it can finish the sign-in.
    expect([...b.jar.keys()].some((k) => k.endsWith("-code-verifier"))).toBe(true);
    expect(new URL(url).searchParams.get("redirect_to")).toBe(`${APP}/auth/confirm?next=%2Fp%2FCLO-000001`);
  });

  it("password reset emails go to the right kind of account only", async () => {
    await seedUsers();
    await confirmedShopper();
    await requestPasswordReset(db, browser().supabase, "staff1@test.local", { ip: "10.80.0.1", appUrl: APP, kind: "customer" });
    await requestPasswordReset(db, browser().supabase, SHOPPER.email, { ip: "10.80.0.2", appUrl: APP, kind: "staff" });
    await requestPasswordReset(db, browser().supabase, SHOPPER.email, { ip: "10.80.0.3", appUrl: APP, kind: "customer" });
    const link = await linkFor(SHOPPER.email);
    expect(decodeURIComponent(link)).toContain("/auth/confirm?next=/account/reset-password");
    const list = (await (await fetch(`${MAILPIT_URL}/api/v1/messages`)).json()) as { messages: unknown[] };
    expect(list.messages).toHaveLength(1);
  });

  it("a shopper who never opened the shop after confirming still keeps their email", async () => {
    const { adminId } = await seedUsers();
    await supabaseAdmin().createUser({ email: "quiet@shop.test", password: "shopper-pass-3", email_confirm: true });
    await expect(createStaffUser(db, adminId, { name: "X", email: "quiet@shop.test", password: "password-123" })).rejects.toThrow(/already used/);
  });

  it("sign-ups are limited per connection", async () => {
    const m = { ip: "10.90.0.1", appUrl: APP, next: "/shop" };
    for (let i = 0; i < 5; i++) await signUpCustomer(db, browser().supabase, { ...SHOPPER, email: `s${i}@shop.test` }, m);
    await expect(signUpCustomer(db, browser().supabase, { ...SHOPPER, email: "s9@shop.test" }, m)).rejects.toThrow(/Too many sign-ups/);
  });

  it("rejects bad sign-up and delivery details before anything is sent", () => {
    const bad = (input: object) => customerSignUpSchema.safeParse(input).error?.issues.map((i) => i.message);
    expect(bad({ name: "A", email: "not-an-email", password: "short" })).toEqual(
      expect.arrayContaining(["Enter your name", "Enter a valid email", "Use at least 10 characters"]),
    );
    expect(bad({ name: "Ali", email: "ali@shop.test", password: "onlyletters" })).toContain("Include a number");
    expect(bad({ name: "Ali", email: "ali@shop.test", password: "1234567890" })).toContain("Include a letter");
    expect(bad({ name: "Ali", email: "ali@shop.test", password: "a1".repeat(40) })).toContain("Use at most 72 characters");
    const details = (input: object) => customerDetailsSchema.safeParse(input).error?.issues.map((i) => i.path[0]);
    expect(details({ name: "Ali", phone: "12", address: "short", city: "L" })).toEqual(["phone", "address", "city"]);
    expect(customerDetailsSchema.parse({ name: " Ali ", phone: "0300-123 4567", whatsapp: "", address: "House 1, Street 2, Area", city: "Lahore" })).toEqual({
      name: "Ali",
      phone: "03001234567",
      whatsapp: null,
      address: "House 1, Street 2, Area",
      city: "Lahore",
    });
  });

  it("wrong passwords and unknown emails get the same answer, and guessing locks the email", async () => {
    await confirmedShopper();
    const m = { ip: "10.62.0.1" };
    await expect(loginCustomer(db, browser().supabase, { email: "nobody@shop.test", password: "whatever-123" }, m)).rejects.toThrow("Email or password is incorrect.");
    for (let i = 0; i < 5; i++) {
      await expect(loginCustomer(db, browser().supabase, { ...SHOPPER, password: `wrong-${i}` }, m)).rejects.toThrow("Email or password is incorrect.");
    }
    await expect(loginCustomer(db, browser().supabase, SHOPPER, m)).rejects.toThrow(/Too many failed attempts/);
    // Another connection is not locked out by someone else's guessing.
    await expect(loginCustomer(db, browser().supabase, SHOPPER, { ip: "10.62.0.2" })).resolves.toBeTruthy();
  });

  it("an email confirmation code works once, and a made-up code never", async () => {
    const b = browser();
    await signUpCustomer(db, b.supabase, SHOPPER, meta());
    const res = await fetch(await linkFor(SHOPPER.email), { redirect: "manual" });
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    expect((await b.supabase.auth.exchangeCodeForSession(code)).error).toBeNull();
    expect((await browser().supabase.auth.exchangeCodeForSession(code)).error).not.toBeNull();
    expect((await browser().supabase.auth.exchangeCodeForSession("made-up-code")).error).not.toBeNull();
    // Opening the same email link again does not sign anyone in.
    const again = await fetch(await linkFor(SHOPPER.email), { redirect: "manual" });
    expect(again.headers.get("location") ?? "").not.toMatch(/[?&]code=/);
  });

  it("a team member's session is never a shopper, and a forged cookie is nobody", async () => {
    await seedUsers();
    const team = browser();
    await login(db, team.supabase, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.63.0.1" });
    expect(await resolveCustomer(db, team.supabase)).toBeNull();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(customerAccounts);
    expect(n).toBe(0);

    const shop = browser();
    await confirmedShopper();
    await loginCustomer(db, shop.supabase, SHOPPER, { ip: "10.63.0.2" });
    expect(await resolveCustomer(db, shop.supabase)).toBeTruthy();
    expect(await resolveCustomer(db, forgedCopyOf(shop, crypto.randomUUID()).supabase)).toBeNull();
    // Even claiming a real team account gets nowhere without Supabase's signature.
    const teamId = (await resolveSession(db, team.supabase))!.user.id;
    expect(await resolveSession(db, forgedCopyOf(shop, teamId).supabase)).toBeNull();
  });

  it("a new password signs the shopper's other devices out and keeps this one", async () => {
    const account = await confirmedShopper();
    const phone = browser();
    await loginCustomer(db, phone.supabase, SHOPPER, { ip: "10.64.0.1" });
    const laptop = browser();
    await loginCustomer(db, laptop.supabase, SHOPPER, { ip: "10.64.0.2" });
    await setCustomerPassword(laptop.supabase, account, "brand-new-pass-1");
    expect(await resolveCustomer(db, laptop.supabase)).toBeTruthy();
    expect(await resolveCustomer(db, phone.supabase)).toBeNull();
    await expect(loginCustomer(db, browser().supabase, SHOPPER, { ip: "10.64.0.3" })).rejects.toThrow(/incorrect/);
    await expect(setCustomerPassword(laptop.supabase, account, "x")).rejects.toThrow();
  });

  it("deleting a shopper in Supabase removes their account row but keeps their orders for the shop", async () => {
    const { staffId } = await seedUsers();
    const p = await createProduct(db, staffId, productInput(), await testImage());
    const account = await confirmedShopper();
    await placeOrder(db, { slug: p.slug, size: "M", quantity: 1, customerName: "Ayesha", phone: "03001234567", whatsapp: "", address: "House 12, Street 4, Gulberg", city: "Lahore", notes: "" }, { ip: "10.65.0.1", customerAccountId: account.id });
    expect((await supabaseAdmin().deleteUser(account.id)).error).toBeNull();
    expect(await db.select().from(customerAccounts)).toEqual([]);
    const [order] = await db.select({ account: orders.customerAccountId, name: orders.customerName }).from(orders);
    expect(order).toEqual({ account: null, name: "Ayesha" });
  });

  it("signing up with a team member's email changes nothing for the team account", async () => {
    await seedUsers();
    expect(await signUpCustomer(db, browser().supabase, { name: "Fake", email: "staff1@test.local", password: "attacker-pass-1" }, meta())).toBe("check_email");
    await expect(login(db, browser().supabase, { email: "staff1@test.local", password: "staff-pass-123" }, { ip: "10.66.0.1" })).resolves.toBeTruthy();
    await expect(login(db, browser().supabase, { email: "staff1@test.local", password: "attacker-pass-1" }, { ip: "10.66.0.2" })).rejects.toThrow(/incorrect/);
    expect(await db.select().from(customerAccounts)).toEqual([]);
  });
});
