# Financial Dashboard Webapp

Next.js personal finance planner with Supabase persistence. Clone this repo, add your own Supabase project, and deploy to Vercel.

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
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role (server only) |
   | `DASHBOARD_PIN` | PIN to unlock the app (min 4 chars) |
   | `SESSION_SECRET` | Random string to sign the unlock cookie |

   Optional branding:

   - `NEXT_PUBLIC_APP_TITLE`
   - `NEXT_PUBLIC_APP_KICKER`
   - `NEXT_PUBLIC_APP_SUBTITLE`
   - `NEXT_PUBLIC_APP_ASOF`

   Optional write protection:

   - `DASHBOARD_SECRET` — require header `x-dashboard-secret` on PUT requests

3. **Database migration**

   In Supabase SQL Editor, run:

   [`supabase/migrations/001_dashboard_state.sql`](supabase/migrations/001_dashboard_state.sql)

4. **Run dev server**

   ```bash
   npm run dev
   ```

   Without Supabase configured, the app still runs using browser `localStorage` fallback. Without `DASHBOARD_PIN`, the PIN screen is skipped (local dev only).

## PIN protection

Set `DASHBOARD_PIN` and `SESSION_SECRET` on Vercel. Visitors must enter the PIN before the dashboard or APIs load. Data continues to auto-save to Supabase (single `dashboard_state` row) while you are unlocked.

5. **Tests**

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
