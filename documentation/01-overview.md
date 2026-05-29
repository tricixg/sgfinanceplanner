# 01 — Overview

## Product

**SG Finance Planner** is a personal finance web application focused on Singapore context: SGD, CPF, BTO planning, local credit card rewards catalog, and Singapore timezone (SGT) for dates and times.

Core capabilities:

- **Planning** — Monthly budget, 5-month cashflow, 5-year wealth projection, BTO purchase planner
- **Tracking** — Expense log by budget category, recurring debt/insurance/ILP/subscription payments, unified transaction history, travel trips, poker sessions
- **Accounts** — Cash/savings accounts, credit cards with statement cycles, investments, CPF outlook, instalment and informal debt
- **Household** — Optional partner linking for shared savings pools and goals (personal cash remains separate in net worth views)

## Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Data / auth | Supabase (PostgreSQL + Auth + RLS) |
| Charts | Chart.js, react-chartjs-2 |
| Tests | Vitest |
| Runtime | Node.js ≥ 20.9.0 |

Package and scripts: [webapp/package.json](../webapp/package.json).

Branding defaults: [webapp/lib/config.ts](../webapp/lib/config.ts) (`NEXT_PUBLIC_APP_*` env overrides).

## Repository layout

```text
sgfinanceplanner/
├── documentation/          # This documentation set
└── webapp/                 # Application (deployable unit)
    ├── app/                # Routes: pages + API route handlers
    │   ├── (app)/          # Authenticated UI pages
    │   ├── api/            # REST-style API routes
    │   ├── auth/           # OAuth/magic-link callback
    │   └── login/
    ├── components/         # React UI (tabs, app shell, forms)
    ├── contexts/           # React context providers
    ├── hooks/              # Data-fetching and state hooks
    ├── lib/                # Business logic (no React)
    ├── supabase/migrations/  # SQL schema 001–025
    └── middleware.ts       # Session refresh on each request
```

**Business logic lives in `lib/`**, not in route handlers. Route files should delegate to `lib/*` modules for testability and reuse.

## Runtime modes

### Supabase-backed (production / signed-in)

1. User signs in via magic link ([webapp/app/login/page.tsx](../webapp/app/login/page.tsx)).
2. Session stored in cookies; [webapp/middleware.ts](../webapp/middleware.ts) refreshes it.
3. API routes call [webapp/lib/auth/require-user.ts](../webapp/lib/auth/require-user.ts) and [webapp/lib/supabase/authed.ts](../webapp/lib/supabase/authed.ts).
4. PostgreSQL enforces **Row Level Security (RLS)** per user (and household where applicable).

When Supabase env vars are missing, APIs return `{ configured: false }` and the UI falls back where implemented.

### Local-only (no Supabase)

- [webapp/hooks/usePersistedState.ts](../webapp/hooks/usePersistedState.ts) can persist a full dashboard JSON to `localStorage`.
- Domain APIs are unavailable; feature tabs show “sign in” or empty state.
- Useful for offline UI development without a database.

## Navigation

**Source of truth:** [webapp/lib/nav-config.ts](../webapp/lib/nav-config.ts)

- Defines `NAV_GROUPS`, tab `href`, labels, and summaries.
- [webapp/components/AppSidebar.tsx](../webapp/components/AppSidebar.tsx) + [webapp/components/app/AppShell.tsx](../webapp/components/app/AppShell.tsx) render the sidebar and map pathname → active tab (`navTabForPath`).

**Legacy:** [webapp/components/Dashboard.tsx](../webapp/components/Dashboard.tsx) implements an older single-page tab switcher with `display: none` panels. Production routing uses **file-based routes** under `app/(app)/` (e.g. `/cards`, `/expenses`). Prefer `nav-config` + dedicated pages for new work.

## Data storage model (high level)

| Storage | Purpose |
|---------|---------|
| **Normalized tables** | Loans, budget lines, expenses, cards, savings, holdings, profile, etc. |
| **`dashboard_state.data` (jsonb)** | Slim **UI preferences** only after migration (`_migrated_v2`); legacy full snapshot migrated on first load |
| **In-memory `DashboardState`** | Client-side merge from many APIs for charts/calculators in `lib/finance/*` |

See [02-architecture.md](./02-architecture.md) and [05-database-schema.md](./05-database-schema.md).

## Timezone

User-facing dates and default expense times use **Asia/Singapore** via [webapp/lib/time/sgt.ts](../webapp/lib/time/sgt.ts). Transaction history display uses SGT in [webapp/lib/savings/format-transaction-when.ts](../webapp/lib/savings/format-transaction-when.ts).

## Next steps

- [02-architecture.md](./02-architecture.md) — How requests and state flow through the app
- [09-development-guide.md](./09-development-guide.md) — Local setup and conventions
