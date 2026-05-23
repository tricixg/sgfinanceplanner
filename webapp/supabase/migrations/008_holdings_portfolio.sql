-- Holdings and portfolio snapshots
-- Run after 007_loans_budget.sql

create table if not exists holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  ticker text not null default '',
  market text not null check (market in ('SGX', 'US')),
  qty numeric not null default 0,
  avg_cost numeric not null default 0,
  last_price numeric not null default 0,
  last_price_at timestamptz,
  sector text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists holdings_user_idx on holdings (user_id, sort_order);

create table if not exists portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recorded_at timestamptz not null,
  total_value numeric not null default 0,
  total_cost numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_snapshots_user_recorded_idx
  on portfolio_snapshots (user_id, recorded_at desc);

alter table holdings enable row level security;
alter table portfolio_snapshots enable row level security;

create policy "Users manage own holdings"
  on holdings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own portfolio snapshots"
  on portfolio_snapshots for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
