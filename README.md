# sgfinanceplanner

Personal finance dashboard for Singapore — cashflow, CPF, debt, BTO, savings goals, and wealth planning.

## Quick start

The web app lives in [`webapp/`](webapp/). See [webapp/README.md](webapp/README.md) for full setup (Supabase, Vercel, env vars).

```bash
cd webapp
cp .env.example .env.local   # add your Supabase keys
npm install
# Run supabase/migrations/001_dashboard_state.sql in Supabase SQL editor
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Legacy

[`financial_dashboard.html`](financial_dashboard.html) is the original single-file version (browser localStorage only). The Next.js app is the maintained version with cloud save.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Chart.js** + react-chartjs-2
- **Supabase** (Postgres JSONB) for persistence
- **Vercel** for hosting
