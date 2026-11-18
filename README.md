# Threadline

Clothing inventory, AI product photography and customer orders for one clothing business.

- **Staff app:** dashboard, products (photo → quantity → description → Kids/Youth/Adult sizes → prices), size-wise inventory with an immutable stock ledger, AI image jobs, public links, orders, customers, activity logs, users, settings.
- **Customer page:** `/p/CLO-000001` — product photos, sizes, price and an order form. No account needed.
- **Exactly four accounts:** one admin (slot 1) and three users, enforced by the database.

Design and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js 16 · TypeScript · Tailwind CSS 4 · shadcn/ui · React Hook Form + Zod · TanStack Query · Drizzle ORM ·
**Supabase** (PostgreSQL + Auth) · **Cloudinary** (images) · Cloudflare / Gemini / OpenAI (AI photos) · Postgres-backed job queue.

## Local development

```bash
docker compose up -d          # Postgres + Supabase Auth + mail catcher (see below)
cp .env.example .env          # then set ADMIN_EMAIL / ADMIN_PASSWORD
pnpm supabase:local-env >> .env   # local Supabase Auth URL and keys
pnpm install
pnpm db:migrate
pnpm db:seed                  # creates the admin account (in Supabase Auth and here)
pnpm dev
```

`docker compose` starts:
- Postgres on `127.0.0.1:55433` (databases `threadline` and `threadline_test`);
- Supabase Auth (the same server Supabase runs) for development at `http://127.0.0.1:54321` and for tests at `http://127.0.0.1:54331`;
- Mailpit at http://127.0.0.1:54324, which catches password-reset emails.

The local keys are signed with Supabase's public development secret, so they are worthless anywhere else.

In development, images are stored in `./storage` (`STORAGE_DRIVER=local`).

## Production setup

### 1. Supabase (database)

1. Create a Supabase project.
2. Project Settings → Database → Connection string:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Direct** or **Session pooler** (port `5432`) → `MIGRATION_DATABASE_URL`
3. Database → SSL Configuration → download the CA certificate and set `DATABASE_CA_CERT`. It can be the file path or the PEM text itself (useful on Vercel). TLS is then fully verified against Supabase's CA.
   - Without it, Node rejects Supabase's certificate, because it chains to Supabase's own root CA.
   - Don't put `sslmode` in the URLs when using the CA; the app removes it anyway, so it can't override the CA.
4. Run `pnpm db:migrate` and `pnpm db:seed` once. Migrations also turn on Row Level Security for every table and revoke the `anon`/`authenticated` roles. Supabase's public Data API can therefore read nothing, while the app, which connects as the table owner, is unaffected.

#### Supabase Auth (sign-in)

Sign-in, sessions and password-reset emails use Supabase Auth. The four-account limit, roles and deactivation stay in the app's `users` table, whose ids are the Supabase user ids.

1. Project Settings → API Keys: set `SUPABASE_URL` (`https://<project-ref>.supabase.co`), `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`. The legacy `anon` / `service_role` keys also work (`SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`). Only the server uses them; never add `NEXT_PUBLIC_`.
2. Authentication → Sign In / Providers → Email: **turn off "Allow new users to sign up"**. Accounts are made only by the admin. (Even if it is left on, a self-made Supabase user has no account here and cannot get in.)
3. Authentication → URL Configuration: Site URL = `APP_URL`; add `APP_URL/auth/confirm` to Redirect URLs.
4. Authentication → Emails → "Reset password" template: replace the link with
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   so the link works in any browser. Supabase's default link also works, but only in the browser that asked for it.
5. Authentication → Emails → SMTP: set up your own SMTP (e.g. Resend, Brevo). Supabase's built-in sender only delivers to your project team's addresses and a few emails per hour.
6. `pnpm db:seed` creates the admin in Supabase Auth and in slot 1. Running it again resets the admin's password.

Accounts made before Supabase Auth was added are upgraded with the same id: the admin's by `pnpm db:seed`, staff when the admin resets their password.

### 2. Cloudinary (images)

Set `STORAGE_DRIVER=cloudinary` and `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
(Cloudinary console → API Keys).
- The browser uploads the photo straight to Cloudinary using a short-lived signature from the server. Large phone photos therefore never pass through the app server; Vercel caps request bodies at 4.5 MB.
- The server then downloads and checks the bytes, and stores a thumbnail plus a display copy.
- Originals are kept untouched for staff downloads. Customers only see re-encoded copies, without EXIF/GPS data.

### 3. AI images

| Provider | Cost | Notes |
|---|---|---|
| `cloudflare` (default) | **Free**: 10,000 Workers AI neurons a day, about 160 per 1024×1280 image with FLUX.2 [klein] 4B, so ~60 images (~30 products) a day | The reference photo is reduced below 512×512 for this model, so fine logos/prints may soften. `CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-9b` gives better detail but only ~6 free images a day. |
| `gemini` | Paid, about $0.034 per image (`gemini-3.1-flash-lite-image`) | Best at keeping the exact garment. Note that `gemini-2.5-flash-image` shuts down on 2027-03-15. |
| `openai` | Paid | `gpt-image-1` edits |

- **Setup:** set `AI_IMAGE_PROVIDER` and that provider's keys. For Cloudflare, create a free account; the Account ID is on the dashboard, and an API token comes from the "Workers AI" template.
- **Fallback:** with `AI_FALLBACK_PROVIDER=gemini`, products still get photos after the free allowance runs out. Without a fallback, jobs wait until the allowance resets at 00:00 UTC, without using up their retries.
- **Choosing per product:** when more than one provider is set up, **Regenerate AI images** on a product lets staff pick one, e.g. the paid one when the free result misses a print.
- **Not configured:** without any key, products still save, and their AI jobs fail with "AI provider not configured".

### 4. Background jobs

Jobs start right after a product is saved. A sweep handles retries, crashed jobs and pending-order expiry. Run the sweep one of two ways:

- **Vercel Pro:** `vercel.json` already calls `/api/cron/worker` every minute. Set `CRON_SECRET` (32+ characters). The Hobby plan only allows daily crons and 60-second functions. There, remove `crons` from `vercel.json`, and call the URL every minute from an external scheduler (e.g. cron-job.org) with `Authorization: Bearer <CRON_SECRET>`, or run `pnpm worker` on a small server.
- **VPS / Docker:** run `pnpm worker` next to `pnpm start`.

Both can run at the same time safely, because jobs are claimed with `FOR UPDATE SKIP LOCKED`.

Each sweep also:
- cancels expired pending orders;
- fails AI jobs whose worker died on the last attempt;
- adds metadata-free display copies to photos saved before copies existed;
- every 6 hours, deletes stored files that no image points at and that are older than a day (abandoned uploads).

### 5. Other variables

- `APP_URL` is the public base URL used in share links.
- `TRUSTED_PROXY` names the proxy header that holds the client IP for rate limits. Leave it empty on Vercel. Elsewhere the default is `xff` (right-most `X-Forwarded-For`), which is only safe behind a proxy that appends that header. Without a proxy, clients can fake it, and the server logs a warning at startup. Use `nginx` behind nginx with `proxy_set_header X-Real-IP $remote_addr`, or `cloudflare` behind Cloudflare. Never trust a header your proxy doesn't overwrite.
- Uploads go straight from the browser to storage only with Cloudinary. With the `s3` driver on Vercel, photos still pass through the app and are capped at 4.5 MB.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm db:generate` | New migration from schema changes |
| `pnpm db:migrate` | Apply migrations (`MIGRATION_DATABASE_URL` if set) |
| `pnpm db:migrate:test` | Apply migrations to the test database |
| `pnpm db:seed` | Create or reset the admin account |
| `pnpm supabase:local-env` | Print the local Supabase Auth settings for `.env` |
| `pnpm worker` | Long-running job worker |
| `pnpm test` | Unit and integration tests against the test database and the local Supabase Auth test server (`docker compose up -d` first) |
| `pnpm test:e2e` | Playwright end-to-end tests (production build on port 3300, test database). Set `PW_CHROMIUM_PATH` to use an already-downloaded Chromium. |
| `pnpm typecheck` / `pnpm lint` | Static checks |

## What the tests cover

- Four-account limit, including direct database inserts and two admins racing for the last slot (the loser's Supabase user is removed).
- Every account row belongs to a Supabase Auth user; a Supabase user without an account here cannot get in.
- Login, forged cookies, lockout and the permission matrix, against a real Supabase Auth server.
- Sign-out, deactivation, admin password reset and password change end sessions on the server (copied cookies stop working).
- Forgot password: email only to real accounts, the link signs in once, both link styles, per-connection and per-email limits.
- Unique SKUs when products are saved at the same time.
- Size totals must match the quantity, sizes must fit the group, and no image files are left behind on failure.
- Stock can never go negative, and the ledger and activity log cannot be changed.
- 20 simultaneous orders for 5 pieces: exactly 5 succeed.
- Reserve, release and deduct for each order status, the `on_confirm` policy, and pending-order expiry.
- The public product data contains no cost, margin, user or database ids.
- AI worker retries with backoff, permanent failures, crashed-job recovery, and no double claims.
- Marketing card output size.
- Cloudinary request signing.
- Public pages serve photos without EXIF/GPS data, under names that don't reveal the original's address.
- Upload tickets can't be replayed to touch another product's files.
- The orphan-file sweep and the display-copy backfill work.
- Every table has Row Level Security on.
- Customer totals are stored as bigint, so large amounts don't overflow.
- Login limits hold under parallel guessing, per connection and per email, while the owner's known connection still gets in.
- Order limits hold per connection and per phone, and failed orders don't count.
- Customer records can't be overwritten by anonymous orders.
- Login redirects stay on the same site.
- A crashed AI job is never re-run past its last attempt, and a worker that lost its job can't save its result.
- Supabase TLS settings with a CA certificate.
- End to end (Playwright):
  - Staff create a product through the six-step form (wrong totals are refused) and cannot reach admin pages.
  - Staff can add stock but not remove it.
  - A customer orders from the public page, and the page contains no purchase price.
  - The admin is notified, then confirms, dispatches and delivers the order; stock and profit update.
  - Unpublishing a product makes its link return 404.
  - All four account slots fill up.
  - Forgot password through the real email link, the link works once, then the password is changed back in Settings.
  - Sign-out kills the session even for someone holding copied cookies.
  - Anonymous API calls and path traversal are refused.
