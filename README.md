# Threadline

Clothing inventory, AI product photography and customer orders for one clothing business.

- **Staff app:** dashboard, products (photo → quantity → description → Kids/Youth/Adult sizes → prices), size-wise inventory with an immutable stock ledger, AI image jobs, public links, orders, customers, activity logs, users, settings.
- **Customer page:** `/p/CLO-000001` — product photos, sizes, price and an order form. No account needed.
- **Exactly four accounts:** one admin (slot 1) and three users, enforced by the database.

Design and decisions: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

Next.js 16 · TypeScript · Tailwind CSS 4 · shadcn/ui · React Hook Form + Zod · TanStack Query · Drizzle ORM ·
**Supabase** (PostgreSQL) · **Cloudinary** (images) · Gemini or OpenAI (AI photos) · Postgres-backed job queue.

## Local development

```bash
docker compose up -d          # Postgres on 127.0.0.1:55433 (dev + test databases)
cp .env.example .env          # then set ADMIN_EMAIL / ADMIN_PASSWORD
pnpm install
pnpm db:migrate
pnpm db:seed                  # creates the admin account
pnpm dev
```

In development, images are stored in `./storage` (`STORAGE_DRIVER=local`).

## Production setup

### 1. Supabase (database)

1. Create a Supabase project.
2. Project Settings → Database → Connection string:
   - **Transaction pooler** (port `6543`) → `DATABASE_URL`
   - **Direct** or **Session pooler** (port `5432`) → `MIGRATION_DATABASE_URL`
   - Add `?sslmode=require` to both.
3. Optional, for fully verified TLS: download the CA certificate (Database → SSL) and set `DATABASE_CA_CERT` to its path.
4. Run `pnpm db:migrate` and `pnpm db:seed` once.

Supabase Auth is not used. The app has its own login so it can enforce the four-account rule.

### 2. Cloudinary (images)

Set `STORAGE_DRIVER=cloudinary` and `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
(Cloudinary console → API Keys). Uploads are signed on the server, and originals are stored without changes.

### 3. AI images

`AI_IMAGE_PROVIDER=gemini` with `GEMINI_API_KEY` (default model `gemini-2.5-flash-image`), or
`AI_IMAGE_PROVIDER=openai` with `OPENAI_API_KEY`. Without a key, products still save. Their AI jobs fail with
"AI provider not configured" and can be retried from **AI Product Images**.

### 4. Background jobs

Jobs start right after a product is saved. A sweep handles retries, crashed jobs and pending-order expiry. Run the sweep one of two ways:

- **Vercel:** `vercel.json` already calls `/api/cron/worker` every minute. Set `CRON_SECRET` (32+ characters).
- **VPS / Docker:** run `pnpm worker` next to `pnpm start`.

Both can run at the same time safely, because jobs are claimed with `FOR UPDATE SKIP LOCKED`.

### 5. Other variables

`APP_URL` is the public base URL used in share links.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm db:generate` | New migration from schema changes |
| `pnpm db:migrate` | Apply migrations (`MIGRATION_DATABASE_URL` if set) |
| `pnpm db:migrate:test` | Apply migrations to the test database |
| `pnpm db:seed` | Create or reset the admin account |
| `pnpm worker` | Long-running job worker |
| `pnpm test` | Unit and integration tests against the real test database |
| `pnpm typecheck` / `pnpm lint` | Static checks |

## What the tests cover

- Four-account limit, including direct database inserts.
- Login lockout, session expiry on deactivation, and the permission matrix.
- Unique SKUs when products are saved at the same time.
- Size totals must match the quantity, sizes must fit the group, and no image files are left behind on failure.
- Stock can never go negative, and the ledger and activity log cannot be changed.
- 20 simultaneous orders for 5 pieces: exactly 5 succeed.
- Reserve, release and deduct for each order status, the `on_confirm` policy, and pending-order expiry.
- The public product data contains no cost, margin, user or database ids.
- AI worker retries with backoff, permanent failures, crashed-job recovery, and no double claims.
- Marketing card output size.
- Cloudinary request signing.
