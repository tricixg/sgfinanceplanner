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
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Admin routes, dev bypass |
| `NEXT_PUBLIC_APP_TITLE` etc. | Optional | Branding ([config.ts](../webapp/lib/config.ts)) |
| `AUTH_BYPASS_DEV` | Local only | Skip login |
| `DEV_USER_ID` / `DEV_USER_EMAIL` | With bypass | Impersonate user |

---

## Database migrations

Run SQL files in order in Supabase **SQL Editor**:

`webapp/supabase/migrations/001_*.sql` … `025_*.sql`

See [05-database-schema.md](./05-database-schema.md) for what each migration adds.

After migrations, enable **Email** provider and set redirect URLs under Authentication → URL configuration.

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
| `time/` | SGT date/time helpers |
| `migrate-all-domains.ts` | Legacy dashboard JSON → tables |

---

## Testing

Colocated tests: `*.test.ts` next to modules (e.g. `lib/cards/statement-cycle.test.ts`).

Run all: `npm run test`.

Prefer testing pure functions in `lib/finance` and `lib/cards` over full HTTP integration.

---

## Adding a feature (checklist)

1. **Schema** — New migration `026_*.sql` if persistence changes; document in [05-database-schema.md](./05-database-schema.md)
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
- Run pending migrations on production Supabase before deploying code that depends on them

---

## Documentation

Technical docs: [documentation/README.md](./README.md)

---

## Related

- [02-architecture.md](./02-architecture.md)
- [08-authentication-and-security.md](./08-authentication-and-security.md)
