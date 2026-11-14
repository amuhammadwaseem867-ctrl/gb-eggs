# GB Eggs — Poultry & Egg Management ERP

A production-grade ERP for poultry farms and egg trading businesses: flocks, daily egg
collection, graded inventory, purchases, invoicing, customers and suppliers, feed and medicine,
expenses, payroll, accounting and reporting. Built with **Next.js 16 (App Router), TypeScript,
Tailwind CSS v4, shadcn/ui, Supabase (PostgreSQL + Auth + Storage), Recharts, React Hook Form
and Zod**.

All business rules — stock, money, permissions — are enforced **in PostgreSQL** (constraints,
triggers, row locks, `SECURITY DEFINER` functions and Row Level Security), so the database stays
correct no matter which client writes to it.

---

## Contents

1. [Features](#features)
2. [Project structure](#project-structure)
3. [Architecture & business rules](#architecture--business-rules)
4. [Database migrations](#database-migrations)
5. [Roles & permissions](#roles--permissions)
6. [Environment variables](#environment-variables)
7. [Installation](#installation)
8. [Supabase setup](#supabase-setup)
9. [Running in development](#running-in-development)
10. [Testing](#testing)
11. [Production deployment](#production-deployment)
12. [Security checklist](#security-checklist)
13. [Known limitations](#known-limitations)

---

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | Live KPIs from the database: live birds, eggs collected / purchased / sold today, available stock (eggs + trays), broken eggs, customers, receivables & payables, today's revenue / expenses / net profit, cash balance. Charts for production (with daily production rate), sales and expenses by category; recent transactions and collections; low-stock, medicine-expiry, vaccination-due and mortality alerts. |
| **Poultry** | Farms & stores, sheds, breeds, flocks/batches (age, placement date, opening birds), chicken purchases, daily mortality, chicken sales (per bird / per kg), transfers between flocks, vaccinations. Full chronological flock history with a live-bird reconciliation. |
| **Egg production** | Shed-wise daily collection (morning/evening) graded into small, medium, large, XL, dirty, broken and rejected. Duplicate and inconsistent records are rejected. Daily / weekly / monthly summaries with hen-day production rate. |
| **Egg inventory** | Stock per grade and location held in individual eggs, displayed as trays/cartons + loose eggs using configurable conversions. Immutable movement ledger, period movement summary, damages, opening stock, adjustments, transfers between locations, packaging materials (trays, cartons). |
| **Egg purchases** | Supplier invoices (draft → confirm), any packaging unit, discount and freight, payments, returns to supplier, cancellation with stock reversal. |
| **Egg sales** | Invoices for registered or walk-in customers, quantities in eggs / dozens / trays / cartons, discount, delivery charges, configurable sales tax, cash / credit / partial / multiple payments, returns (good eggs restocked, damaged written off), cancellation, print view and PDF export. |
| **Customers & suppliers** | Profiles, opening balances, credit limits, outstanding balances, full statement-of-account ledgers with running balance (PDF/Excel), all documents and payments. Supplier types: egg, chicken, feed, medicine, packaging. |
| **Feed** | Feed items at weighted-average cost, opening stock, purchases, daily shed-/batch-wise consumption, remaining stock, low-stock alerts. |
| **Medicine** | Medicines stocked by batch number and expiry date, purchases, usage per flock (medication history), first-expiry-first-out issue, expiry and low-stock alerts. |
| **Expenses** | Categorised expenses (chicken purchases, feed, medicine, electricity, transport, labour, salaries, packaging, maintenance, misc. — configurable) with date, amount, method, account, reference and description. |
| **Employees** | Profiles, employee IDs, daily attendance sheet, salary advances, monthly payroll generated from salary & attendance with advance recovery, salary payment. |
| **Accounting** | Cash & bank accounts, immutable cashbook with running balance, receipts & payments, other income / owner capital, fund transfers, receivables & payables, accrual profit & loss with cash analysis. |
| **Reports** | 14 reports with date and farm / shed / customer / supplier / category / account / batch filters, exported to **PDF and Excel**: daily collection, monthly production, egg inventory, purchases, sales, customer ledger, supplier ledger, feed consumption, medicine inventory, mortality, expenses, salaries, cashbook, profit & loss. |
| **Settings** | Company profile and logo, address, phone, currency (PKR), time zone (Asia/Karachi), language (English / Urdu with RTL), invoice prefixes & numbering, packaging conversions (tray = 30 eggs …), tax, negative-stock override, alert thresholds, users & roles, permission matrix, audit log. |

---

## Project structure

```
gb-eggs/
├── .env.example                 # Environment variable template
├── .github/workflows/ci.yml     # Lint, typecheck, unit + DB tests, seed, build
├── next.config.ts               # Security headers, Turbopack/Tailwind
├── supabase/
│   ├── config.toml              # Supabase CLI (local stack) configuration
│   ├── migrations/              # 11 ordered SQL migrations (schema, logic, RLS)
│   └── seed.sql                 # Development-only demo data (30 days of activity)
├── src/
│   ├── proxy.ts                 # Session refresh + route protection (Next 16 "proxy")
│   ├── app/
│   │   ├── (auth)/login/        # Sign-in and one-time administrator registration
│   │   ├── setup/               # Shown when Supabase env vars are missing
│   │   ├── (app)/               # Authenticated application (layout, loading, error)
│   │   │   ├── dashboard/  poultry/  production/  inventory/  purchases/  sales/
│   │   │   ├── customers/  suppliers/  feed/  medicine/  expenses/  employees/
│   │   │   └── accounting/  reports/  settings/  forbidden/
│   │   └── actions/             # Server actions (Zod-validated, RLS-bound Supabase calls)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   ├── layout/              # Collapsible navy sidebar, top bar, brand mark
│   │   ├── forms/               # Schema-driven forms, searchable select
│   │   ├── shared/              # Data table, filters, pagination, stat cards, dialogs
│   │   ├── documents/           # Invoice form, detail, returns, PDF invoice
│   │   ├── parties/             # Customer / supplier lists and ledgers
│   │   └── dashboard/  accounting/  employees/  reports/  settings/
│   └── lib/
│       ├── supabase/            # server / browser / admin (server-only) clients
│       ├── auth.ts              # Session + permission data-access layer
│       ├── calc.ts              # Pure business calculations (unit-tested)
│       ├── forms/               # Field definitions → shared client/server Zod schemas
│       ├── data/                # Query helpers, option loaders, document loaders
│       ├── reports.ts           # Report registry (14 reports)
│       └── format.ts  i18n.ts  nav.ts  errors.ts  types.ts  env.ts
└── tests/
    ├── unit/                    # Calculation & validation tests
    ├── db/                      # Integration tests against the real migrations
    └── e2e/                     # Local Supabase-compatible stack + Playwright tests
```

---

## Architecture & business rules

* **Server-first.** Pages are React Server Components that query Supabase **as the signed-in
  user** (`@supabase/ssr` cookie session), so Row Level Security applies to every read. Mutations
  are Server Actions that validate input with the same Zod schemas the client forms use, then
  call Supabase; the database re-validates everything.
* **Stock is a ledger.** `egg_inventory` holds the balance per (location, grade);
  `egg_stock_movements` is an immutable ledger. Every change goes through `_egg_stock_move()`,
  which locks the inventory row with `SELECT … FOR UPDATE`, refuses to go negative (unless an
  administrator enables the override) and writes a ledger row. Concurrent sales of the same grade
  serialise on that row, so stock can never be double-sold (covered by a concurrency test).
* **Closing stock** = Opening + Production + Purchases + Sales returns + Adjustments in + Transfers
  in − Sales − Damages − Returns out − Adjustments out − Transfers out (`egg_stock_summary()`).
* **Live birds** = Opening + Purchases + Transfers in − Mortality − Sales − Transfers out
  (`batch_live_birds()`); removals that would make a flock negative are rejected under a row lock.
* **Production rate** = saleable eggs ÷ live laying hens × 100. Each collection snapshots the live
  hens of the shed; period rates are Σ saleable ÷ Σ hen-days. One posted record per shed per day;
  the size breakdown must equal the eggs collected; a shed cannot report more eggs than hens.
* **Documents are atomic.** `save_egg_sale` / `save_egg_purchase` create the invoice, its lines,
  stock movements and the payment in one transaction with gap-free, row-locked numbering.
  Confirmed documents cannot be edited; cancellation reverses stock and voids payments with
  reversing cashbook entries. Returns restore eligible stock (sales) or remove it (purchases);
  damaged returns are recorded as losses.
* **Money is a ledger.** `financial_transactions` is immutable; voids post equal and opposite
  reversals. Payments can be allocated to any document (egg/chicken sales, egg/chicken/feed/
  medicine/packaging purchases) and cannot exceed what is outstanding; refunds cannot exceed what
  was overpaid. Walk-in sales must be paid in full; customer credit limits are enforced.
* **Revenue vs. collections.** Profit & loss is on an accrual basis: revenue is recognised on the
  invoice date. Receipts against older invoices are reported as *collections of previous
  receivables* in the cash analysis, never as new revenue. Tax collected is excluded from revenue.
* **Traceability.** Every business table has an audit trigger recording who changed what
  (old/new JSON). Ledgers, returns and adjustments are immutable; voids and cancellations require
  a reason and the right permission.

---

## Database migrations

| File | Contents |
| --- | --- |
| `…01_foundation.sql` | `roles`, `app_modules`, `role_permissions`, `profiles` (+ first-user-is-admin trigger), permission helpers (`has_perm`, `require_perm`), `app_settings`, `document_sequences`, `audit_logs` + generic audit trigger |
| `…02_master_data.sql` | `farms`, `sheds`, `chicken_breeds`, `customers`, `suppliers`, `cash_accounts`, `egg_grades`, `packaging_types`, `expense_categories`, `feed_categories` |
| `…03_poultry.sql` | `chicken_batches`, `chicken_purchases`, `mortality_records`, `chicken_sales`, `chicken_transfers`, `vaccination_records`, live-bird function/view, flock guards, `void_flock_event` |
| `…04_eggs.sql` | `egg_inventory`, `egg_stock_movements`, `egg_collections`, `egg_damages`, `egg_stock_adjustments`, `egg_stock_transfers`, `packaging_items/movements`, `egg_purchases(+_items)`, `egg_sales(+_items)`, `sales_returns(+_items)`, `purchase_returns(+_items)`, purchase/sale/return RPCs |
| `…05_feed_medicine.sql` | `feed_inventory`, `feed_purchases`, `feed_consumption`, `medicines`, `medicine_batches`, `medicine_movements`, `void_stock_record` |
| `…06_expenses_hr.sql` | `expenses`, `other_incomes`, `employees`, `attendance`, `employee_advances`, `salary_records`, `pay_salary`, `void_salary`, `void_cash_record` |
| `…07_finance.sql` | `financial_transactions` (cashbook), `fund_transfers`, `payments`, payment validation/allocation, balances (`customer_balance`, `supplier_balance`), `v_party_documents`, balance views, `party_ledger` |
| `…08_reporting.sql` | `financial_summary` (P&L + cash analysis), `egg_stock_summary`, `production_report`, `dashboard_summary`, `dashboard_charts` |
| `…09_security.sql` | RLS on every table, policies per module/action, privilege grants, function execute allow-list |
| `…10_storage.sql` | `branding` storage bucket + policies for the company logo |
| `…11_aggregates.sql` | Server-side totals (`document_totals`, `cashbook_opening`, `party_totals`) |

All tables have primary keys, foreign keys, indexes on lookup/date columns, unique constraints
(invoice numbers, one collection per shed per day, one salary per employee per month, supplier
invoice numbers …), check constraints and `created_at`/`updated_at` timestamps.

---

## Roles & permissions

| Role | Default access |
| --- | --- |
| **Admin** | Everything, including users, permissions, settings, the negative-stock override and the audit log. |
| **Manager** | Farm operations, production, inventory, purchases, sales, customers, suppliers, feed, medicine, expenses (record), employees, reports. Can void production, poultry and inventory records. |
| **Accountant** | Accounting, invoices, payments, customers, suppliers, expenses, payroll, reports, read-only inventory. Can void payments and expenses. |
| **Staff** | Operational entry only: egg collection, mortality, feed consumption, medicine usage. No sales, money or settings. |

The matrix (view / create / edit / void-delete per module) is editable by an admin in
**Settings → Permissions** and is enforced by RLS policies and database functions, not only by
hiding buttons. The **first account** registered becomes the administrator; later accounts start
as Staff, or are created by an admin with a chosen role.

---

## Environment variables

See [`.env.example`](.env.example).

| Variable | Where | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | yes | Publishable / anon key (RLS-protected). `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | optional | Lets admins create users in Settings → Users. Imported only by `src/lib/supabase/admin.ts` (marked `server-only`). |
| `TEST_DB_ADMIN_URL` | local / CI | tests only | Superuser URL of a scratch PostgreSQL for the database tests |

No credentials are committed. If the public variables are missing, the app shows a `/setup` page
explaining what to configure instead of crashing.

---

## Installation

Requirements: **Node.js 20.9+** (22 LTS recommended), npm, and a Supabase project (cloud) or the
Supabase CLI with Docker (local).

```bash
npm ci
```

```bash
cp .env.example .env.local
```

Then fill in `.env.local` (see below).

---

## Supabase setup

### Option A — Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com) (a nearby region, e.g. Mumbai or Singapore).
2. Apply the migrations with the CLI:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

   ```bash
   npx supabase db push
   ```

   Or run each file in `supabase/migrations/` **in order** in the dashboard's SQL editor.
3. **Do not run `seed.sql` in production**: it is demo data.
4. Project Settings → API: copy the Project URL and publishable (anon) key into `.env.local`.
   Optionally copy the service-role / secret key into `SUPABASE_SERVICE_ROLE_KEY`.
5. Authentication → URL configuration: set **Site URL** to your app URL.
6. Start the app, open `/login` and create the administrator (the first account becomes admin).
7. **Then disable public sign-ups** (Authentication → Sign In / Providers → Email → *Allow new users
   to sign up* = off). Create further users in **Settings → Users** (needs the service-role key),
   or invite them from the Supabase dashboard and assign roles in Settings.
8. Storage: migration 10 creates the public `branding` bucket used for the company logo.

### Option B — Local Supabase (CLI + Docker)

```bash
npx supabase start
```

```bash
npx supabase db reset
```

`db reset` applies all migrations and the development seed. Put the printed API URL
(`http://127.0.0.1:54321`) and anon key in `.env.local`, then sign up at `/login` to create the
admin.

---

## Running in development

```bash
npm run dev
```

Open <http://localhost:3000>. Other commands:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run build && npm start
```

---

## Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| Unit | `npm run test:unit` | Packaging conversions, invoice totals / tax / discount, live birds, production rate, closing stock, return credit, balances, revenue-vs-collection split, weighted average cost, payroll, shared form validation |
| Database | `npm run test:db` | Applies every migration to a fresh PostgreSQL (with a small Supabase `auth` shim) and tests stock locking under concurrency, negative-stock rules, purchases / sales / cancellations, returns & refunds, payments & voids, flock guards, collection rules, feed / medicine stock, payroll & advances, accrual P&L vs. collections, ledgers, RLS for each role, audit logging and immutability |
| End-to-end | `npm run test:e2e` | Playwright against a running app: every page and report renders, plus real UI flows (credit invoice with partial payment, receipts, returns, cancellation, walk-in rules, duplicate-collection rejection, expenses & voids, attendance, mortality, user creation, role restrictions, PDF & Excel export) |

Database tests need a scratch PostgreSQL superuser (they create and drop `gb_eggs_test`):

```bash
TEST_DB_ADMIN_URL=postgres://postgres:postgres@localhost:5432 npm test
```

Without `TEST_DB_ADMIN_URL` the database suites are skipped and only the unit tests run.

End-to-end tests need the app pointed at a Supabase stack. `tests/e2e/stack.sh up` starts a
self-contained one (local PostgreSQL + the official GoTrue and PostgREST Docker images + a small
gateway) and writes keys to `tests/e2e/.keys`; `supabase start` works too. Build and start the app
with those keys, then run:

```bash
SEED_CMD="psql postgres://postgres:postgres@127.0.0.1:5432/gb_eggs_e2e -f supabase/seed.sql" npm run test:e2e
```

---

## Production deployment

**Recommended: Vercel + Supabase Cloud.**

1. Import the repository in Vercel (framework preset: Next.js).
2. Add environment variables in Vercel → Settings → Environment Variables:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and, optionally,
   `SUPABASE_SERVICE_ROLE_KEY`. Never prefix the service-role key with `NEXT_PUBLIC_`.
3. Apply the migrations to the production database (`supabase db push`), never the seed.
4. Set the Supabase Auth Site URL to the production domain, create the admin, then disable public
   sign-ups.
5. Deploy. Every application page is rendered per request; the proxy refreshes sessions.

**Self-hosting (Node).** `npm ci && npm run build && npm start` behind a reverse proxy with HTTPS.
Any Node 20.9+ host works. Provide the environment variables at **build time** as well, because
public variables are inlined into the browser bundle.

**Operations.**
* Enable Supabase backups / Point-in-Time Recovery.
* Schema changes: add a new numbered migration; never edit an applied one.
* CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit + database tests, the seed and a
  production build on every push.
* The Supabase API returns at most 1,000 rows per request (`max_rows`). Totals are computed in SQL
  and reports page through all rows, so figures are not affected by this limit.

---

## Security checklist

- [x] Supabase Auth with cookie sessions; the JWT is verified server-side (`getClaims`) on every request.
- [x] Protected routes (`src/proxy.ts`), per-page permission checks (`requirePage`) and per-action checks.
- [x] Row Level Security on **every** table; the anonymous role has no table access.
- [x] Writes to stock, payments and ledgers only through `SECURITY DEFINER` functions with explicit
      permission checks; internal helper functions are not executable by clients.
- [x] Server-side validation (Zod in Server Actions + constraints and triggers in PostgreSQL).
- [x] Immutable ledgers, voids with reasons, an audit log of all changes (admin-only).
- [x] Service-role key used only in a `server-only` module for admin user creation.
- [x] Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- [ ] After creating the first admin, disable public sign-ups in Supabase Auth (manual step).

---

## Known limitations

* Urdu (with RTL layout) currently covers navigation, the app shell and dashboard labels; page
  bodies, forms and reports are in English.
* Feed, medicine and packaging are expensed in the P&L when **purchased** (periodic method), not
  when consumed. Feed consumption cost is still tracked and reported separately.
* A medicine usage record draws from a single batch (the one chosen, or the earliest-expiring batch
  holding enough). Split larger issues across batches as separate records.
* The on-screen cashbook shows up to 1,000 entries per period (narrow the dates for more); the
  Cashbook report and its exports include every entry.
* Walk-in invoices cannot be saved as drafts; they must be paid in full when confirmed.
* Password-reset and invitation emails use Supabase Auth's email settings; configure SMTP in
  Supabase for production.
