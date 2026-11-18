# 09 — Development guide

## Prerequisites

- Node.js **≥ 20.9.0** ([webapp/.nvmrc](../webapp/.nvmrc))
- Supabase project (free tier sufficient)
- Optional: Vercel for deployment

## Quick start

```bash
cd webapp
npm install
cp .env.example .env.local
# Fill Supabase URL, anon key, SITE_URL
npm run dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) after configuring auth redirects.

Full user-facing steps: [webapp/README.md](../webapp/README.md).

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes (cloud mode) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon key for client + RLS |
| `NEXT_PUBLIC_SITE_URL` | Production | Magic link redirect base |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional (required for the month-end job) | Admin routes, dev bypass, `/api/cron/month-end` |
| `CRON_SECRET` | Required for the month-end job | Random secret; Vercel Cron sends it as `Authorization: Bearer …`. Unset = the job refuses to run |
| `NEXT_PUBLIC_APP_TITLE` etc. | Optional | Branding ([config.ts](../webapp/lib/config.ts)) |
| `AUTH_BYPASS_DEV` | Local only | Skip login |
| `DEV_USER_ID` / `DEV_USER_EMAIL` | With bypass | Impersonate user |

---

## Database migrations

Files: [webapp/supabase/migrations/](../webapp/supabase/migrations/) (`001_…` to `074_…`). What each adds: [05-database-schema.md](./05-database-schema.md#migration-index).

**How they are applied.** Up to 068 they were pasted into the Supabase SQL editor by hand, untracked. From 069 on use the Supabase CLI, which records each applied file in `supabase_migrations.schema_migrations` on the database, so `migration list` shows what is and isn't applied. The CLI accepts our `NNN_name.sql` names as they are (version `001`, `002`, …); nothing is renamed. The commands below were rehearsed with CLI 2.122.1 against a copy of the schema (001–068 applied by hand, then repair → dry run → push 069–074 → second push "Remote database is up to date").

You need the database connection string: in the Supabase dashboard use **Connect** at the top of the project and copy the **Session pooler** (or direct) URI. Don't use the transaction pooler (port 6543). Percent-encode special characters in the password. Keep it in your shell only; never commit it.

### One-time switch-over (do this once, in order)

Run from `webapp/` on your own machine. Nothing here touches app tables except step 6.

1. **Back up first.** Confirm a recent backup exists (Database → Backups; see [05 → Backups](./05-database-schema.md#backups)).
2. Set the connection string for this shell:
   ```bash
   export SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<url-encoded-password>@<pooler-host>:5432/postgres'
   ```
3. **Look before changing anything.** Expect every local version 001–074 with an empty Remote column. If Remote already lists versions, stop and compare before going on.
   ```bash
   npx supabase@2 migration list --db-url "$SUPABASE_DB_URL"
   ```
4. **Confirm 068 is really applied and 069+ are not** (SQL editor). Expect `monthly_computed_lines`, `date_of_birth`, then `null`:
   ```sql
   select to_regclass('public.monthly_computed_lines'),
          (select column_name from information_schema.columns
            where table_schema = 'public' and table_name = 'user_finance_profile' and column_name = 'date_of_birth'),
          to_regclass('public.ledger_audit_log');
   ```
5. **Record 001–068 as already applied.** This only writes rows to the history table; it runs no migration SQL.
   ```bash
   npx supabase@2 migration repair --status applied $(seq -f "%03g" 1 68) --db-url "$SUPABASE_DB_URL"
   ```
6. **Preview, then apply the pending ones** (069–074 for this change). The dry run must list only the files you expect.
   ```bash
   npx supabase@2 db push --dry-run --db-url "$SUPABASE_DB_URL"
   ```
   ```bash
   npx supabase@2 db push --db-url "$SUPABASE_DB_URL"
   ```
7. Check: Local and Remote now match for 001–074.
   ```bash
   npx supabase@2 migration list --db-url "$SUPABASE_DB_URL"
   ```
8. Deploy the code (merge the PR).

If you'd rather not use the CLI this time: run the files in the SQL editor in order (each from 069 on is idempotent), deploy, and then record them with `bash scripts/mark-migrations-applied.sh` (from `webapp/`). The script lists the history, asks you to type `yes`, marks every local file (or only the versions you pass, e.g. `075 076`) as applied without running them, and ends with a `db push --dry-run` that should say the remote database is up to date.

### Routine for each new migration

1. Add `NNN_snake_case.sql` with the next free number (recheck `main` before merging; renumber on a clash). Make it re-runnable and additive, and document it in 05.
2. CI checks naming/ordering/no gaps and re-runs every file from 069 on (`supabase/tests/migrations.test.ts`); the `database` job runs the SQL tests on real Postgres.
3. **Before merging code that needs it:** `db push --dry-run`, then `db push` (as above).
4. Merge/deploy. Code that calls a function whose migration hasn't run fails with "The database is missing an update. Run migration 0NN_…" rather than an obscure error.

Rollback: migrations here are additive (new functions, nullable columns, new table), so rolling the code back needs no SQL. There are no down scripts.

After a brand-new project's migrations: enable the **Email** provider and set redirect URLs under Authentication → URL configuration.

---

## npm scripts

| Script | Command |
|--------|---------|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Start production | `npm run start` |
| Lint | `npm run lint` |
| Tests | `npm run test` |
| Tests watch | `npm run test:watch` |

Tests use Vitest ([webapp/vitest.config.ts](../webapp/vitest.config.ts)).

---

## Project conventions

### Client data and cross-page refresh

See [webapp/AGENTS.md](../webapp/AGENTS.md#client-data-and-cross-page-refresh) for the full rules:

- **Session cache (`AppDataContext`):** profile, loans, budget, cards, holdings — load once per sign-in; persist via `save*` on the context.
- **Per-tab fetch:** expenses, recurring, transactions, travel, poker — month/session scoped; refresh with `useDomainEvent` when related domains change.
- **After every mutation:** `dispatchDomainEvent(...)` with affected domain(s); subscribe with `useDomainEvent`.

### API routes

- Return `{ configured: false, ... }` when Supabase env missing
- Use `requireSessionUser()` first
- Use `createAuthedSupabaseClient()` for DB
- Log with prefix `[api/feature]` or `[lib/feature]`
- Validate input; return `{ error: string }` with 4xx/5xx

### Business logic

- Put queries and rules in `lib/<domain>/`
- Keep `app/api/**/route.ts` thin (parse body → call lib → JSON)
- Prefer SGT helpers from [webapp/lib/time/sgt.ts](../webapp/lib/time/sgt.ts) for user-visible dates

### UI

- New features: add route under `app/(app)/`, wrapper in `components/app/pages/`, tab in `components/tabs/`
- Register in [webapp/lib/nav-config.ts](../webapp/lib/nav-config.ts)

### Types

- Shared dashboard shape: [webapp/lib/types.ts](../webapp/lib/types.ts)
- Transaction union: [webapp/lib/transactions/types.ts](../webapp/lib/transactions/types.ts)
- Savings domain: [webapp/lib/savings/types.ts](../webapp/lib/savings/types.ts)

---

## `lib/` domain map

| Directory | Responsibility |
|-----------|----------------|
| `auth/` | Session user, dev bypass |
| `supabase/` | Clients, env, middleware helper |
| `finance/` | Calculators: cashflow, CPF, BTO, projections, calendar, card rewards |
| `profile/` | Finance profile, insurance, ILP load/save |
| `budget/` | Budget lines, budget transactions, CSV parse (legacy) |
| `income/` | Income categories, hybrid cashflow |
| `loans/` | Instalment loans |
| `other-loans/` | Personal / balance transfer loans, payments |
| `savings/` | Accounts, pools, goals, ledger |
| `financial-accounts/` | Pay-from sync and mappers |
| `credit-cards/` | Card CRUD, statements load/pay/interest |
| `cards/` | Statement cycles, spend index, SG catalog, interest math |
| `holdings/` | Investments and snapshots |
| `expenses/` | Expenses API helpers, ledger sync, budget summary |
| `transactions/` | Unified list, delete/reimburse actions |
| `recurring/` | Recurring rows, status, prefill |
| `travel/` | Trips, budgets, expenses |
| `poker/` | Sessions, stats, ledger sync |
| `household/` | Partner bootstrap, invites |
| `dashboard/` | Dashboard and Financial Health calculations (pure, unit-tested) |
| `time/` | SGT date/time helpers |
| `migrate-all-domains.ts` | Legacy dashboard JSON → tables |

---

## Testing

Colocated tests: `*.test.ts` next to modules (e.g. `lib/cards/statement-cycle.test.ts`).

Run all: `npm run test`.

Prefer testing pure functions in `lib/finance` and `lib/cards` over full HTTP integration.

**SQL tests** ([webapp/supabase/tests/](../webapp/supabase/tests/)) apply every migration to a throwaway database and call the ledger functions through the real TypeScript wrappers as a signed-in user (RLS applies). By default they use in-process PGlite. Set `TEST_DATABASE_URL` to a disposable Postgres server to also run the concurrency tests (the harness creates and drops its own database). Never point it at Supabase. For example:

```bash
docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:16
```

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres npx vitest run supabase/tests
```

---

## Adding a feature (checklist)

1. **Schema** — New migration `NNN_*.sql` (next free number, re-runnable) if persistence changes; document in [05-database-schema.md](./05-database-schema.md). Balance changes go in a `security invoker` function, not read-modify-write from TypeScript
2. **lib/** — Load/save/mappers + business rules
3. **API** — `app/api/<feature>/route.ts` with auth guard
4. **Hook** (optional) — `hooks/useFeature.ts` wrapping `fetchJson`
5. **UI** — Tab component + `app/(app)/<path>/page.tsx` + route wrapper
6. **Nav** — Entry in `nav-config.ts`
7. **Docs** — Update [04-features.md](./04-features.md) and [03-routes-and-api.md](./03-routes-and-api.md)

---

## Deployment notes

- Set all env vars on Vercel (no dev bypass)
- Ensure production `/auth/callback` is allowlisted in Supabase
- Run pending migrations (`supabase db push`, see [Database migrations](#database-migrations)) before deploying code that depends on them
- Uptime monitoring: `GET /api/health` (no session; 200 healthy, 503 if Supabase is unreachable)
- Error logs: see [Error tracking](#error-tracking)

---

## Documentation

Technical docs: [documentation/README.md](./README.md)

---

## Related

- [02-architecture.md](./02-architecture.md)
- [08-authentication-and-security.md](./08-authentication-and-security.md)

## Error tracking

No external service (option B of OPS-002). Every server error the app masks (`apiError` in [lib/api/api-error.ts](../webapp/lib/api/api-error.ts)) and every uncaught server error ([webapp/instrumentation.ts](../webapp/instrumentation.ts), Next's `onRequestError`) is written to the Vercel function logs as **one JSON line**:

```json
{"level":"error","event":"server_error","time":"…","scope":"api/expenses","message":"duplicate key … ([id], [n])","code":"23505","env":"production"}
```

- **What's in it:** scope, a scrubbed message, Postgres/Next error code or digest, method, path without its query string, route. **Never** request bodies, headers or cookies. Emails, ids, tokens and numbers (amounts, balances) in the message are replaced by `[email]`, `[id]`, `[token]`, `[n]` ([lib/observability/server-error.ts](../webapp/lib/observability/server-error.ts)).
- **Finding them:** in the Vercel project's logs, search for `"event":"server_error"` (add `"scope":"api/expenses"` to narrow it down).
- **Alerting:** set up an alert on that search if your Vercel plan offers log alerts, or add a log drain to a log service and alert there. What's available depends on the plan; check Vercel's current docs.
- User-facing messages (validation, "Insufficient balance", …) are not errors and aren't logged this way.
- If you later want issue grouping (repeats folded into one issue, alert once per new issue, regressions flagged), that's option A: Sentry with the same scrubbing.

## Month-end job

`vercel.json` runs `/api/cron/month-end` daily at 15:30 UTC (23:30 Singapore) on days 28–31. The handler
only proceeds when today (SGT) is the **last day of the month**, then for every user with a finance profile:

1. records the month's **net-worth snapshot** (same calculation as Cash Accounts: personal accounts + funds,
   joint money excluded, less open card balances) — it overwrites any interim value written by the client;
2. **freezes the month's insurance / ILP / loan-load figures** (`monthly_computed_lines`, migration 068).

Nothing is written for a user whose data fails to load. Setup: set `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`
in Vercel. To test: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/month-end?force=1"`
runs it for the current month on any day; the real run on the last day overwrites that month's rows.
Vercel Hobby cron fires within the scheduled hour, which still falls on the last day in Singapore.
