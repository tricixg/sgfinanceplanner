-- Monthly net worth snapshots, upserted client-side on Cash Accounts visits
-- (mirrors the portfolio_snapshots pattern from 008_holdings_portfolio.sql).
-- lnw and cpf are stored separately so the "include CPF" toggle can be
-- applied retroactively across history instead of being baked in per row.

create table if not exists net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  lnw numeric not null default 0,
  cpf numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists net_worth_snapshots_user_month_idx
  on net_worth_snapshots (user_id, month desc);

alter table net_worth_snapshots enable row level security;

create policy "Users manage own net worth snapshots"
  on net_worth_snapshots for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
