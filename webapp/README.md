# Financial Dashboard Webapp

Next.js personal finance planner with Supabase persistence. Clone this repo, add your own Supabase project, and deploy to Vercel.

**Documentation:** [User guide](../documentation/user-guide/README.md) (features & workflows) · [Technical docs](../documentation/README.md) (architecture, API, database)

## Prerequisites

- Node.js 20+
- [Supabase](https://supabase.com) account (free tier)
- [Vercel](https://vercel.com) account (optional, for deploy)

## Local setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in from Supabase → Project Settings → API:

   | Variable | Where |
   |----------|--------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `NEXT_PUBLIC_SITE_URL` | Your deployed URL (for magic links in production) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Optional — service_role for admin tasks only |

   Optional branding:

   - `NEXT_PUBLIC_APP_TITLE`
   - `NEXT_PUBLIC_APP_KICKER`
   - `NEXT_PUBLIC_APP_SUBTITLE`
   - `NEXT_PUBLIC_APP_ASOF`

3. **Database migration**

   In Supabase SQL Editor, run in order:

   1. [`supabase/migrations/001_dashboard_state.sql`](supabase/migrations/001_dashboard_state.sql) (fresh projects only)
   2. [`supabase/migrations/002_per_user_auth.sql`](supabase/migrations/002_per_user_auth.sql)
   3. [`supabase/migrations/003_couples_and_ledger.sql`](supabase/migrations/003_couples_and_ledger.sql) — per-user savings accounts, shared pools, goals, expenses, and partner linking
   4. [`supabase/migrations/004_accounts_ledger.sql`](supabase/migrations/004_accounts_ledger.sql) — `include_in_savings` flags, deposit ledger (`savings_transactions`), and balance sync
   5. [`supabase/migrations/005_financial_accounts_budget.sql`](supabase/migrations/005_financial_accounts_budget.sql) — unified `financial_accounts` (cash + credit cards) and `budget_transactions` for CSV import
   6. [`supabase/migrations/006_credit_cards.sql`](supabase/migrations/006_credit_cards.sql) — credit cards table (migrated from `dashboard_state` JSON)
   7. [`supabase/migrations/007_loans_budget.sql`](supabase/migrations/007_loans_budget.sql) — loans and budget lines
   8. [`supabase/migrations/008_holdings_portfolio.sql`](supabase/migrations/008_holdings_portfolio.sql) — holdings and portfolio snapshots
   9. [`supabase/migrations/009_profile_insurance.sql`](supabase/migrations/009_profile_insurance.sql) — finance profile, insurance, and ILP policies

   After deploy, the app uses route-based pages (`/this-month`, `/savings`, `/transactions`, etc.). Legacy `dashboard_state` JSON is migrated automatically on first load; only UI preferences remain in that blob.

4. **Supabase Auth (magic link)**

   In Supabase → **Authentication** → **Providers** → **Email**:

   - Enable Email provider
   - Enable **Confirm email** if you want verified addresses (optional for personal use)
   - Magic link / OTP is used by default

   In **Authentication** → **URL configuration**, add redirect URLs:

   - `http://localhost:3000/auth/callback` (local)
   - `https://your-app.vercel.app/auth/callback` (production)

5. **Run dev server**

   ```bash
   npm run dev
   ```

   Without Supabase configured, the app still runs using browser `localStorage` only (no sign-in). With Supabase configured, open [`/login`](http://localhost:3000/login), enter your email, and open the magic link — new accounts are created automatically. Each user gets their own `dashboard_state` row (protected by RLS).

   **Couples / shared savings:** In **ME → Settings → Partner**, invite your partner by email. Personal cash accounts live on **ME**; shared pools and goals on **Savings & Goals**. Net worth, cashflow, and projections use **personal** cash only; joint pools are tracked separately on Savings.

6. **Tests**

   ```bash
   npm run test
   ```

## Deploy to Vercel

1. Import this repository in Vercel.
2. Set **Root Directory** to `webapp`.
3. Add the same environment variables as `.env.example`.
4. Deploy.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USER/sgfinanceplanner&root-directory=webapp)

Replace `YOUR_USER` with your GitHub username after publishing the repo.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/state` | Load dashboard JSON (defaults if empty) |
| `PUT` | `/api/state` | Save dashboard JSON `{ "data": { ... } }` |

## Data model

All inputs are stored as one JSON document in `dashboard_state.data` (see migration). This matches export/import from the original HTML dashboard.

## Project structure

```
webapp/
├── app/              # Next.js routes + API
├── components/       # Dashboard UI + tabs
├── hooks/            # Persistence hook
├── lib/finance/      # Calculation engine (ported from HTML)
├── lib/supabase/     # Server Supabase client
└── supabase/         # SQL migrations
```

## Security

- Never commit `.env.local` or expose `SUPABASE_SERVICE_ROLE_KEY` in the browser.
- Use a private Supabase project for real financial data.
- Set `DASHBOARD_SECRET` on public deployments if you skip auth.

## License

Use and modify for personal planning. Not financial advice.
