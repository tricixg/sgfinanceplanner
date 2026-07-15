-- Miles Tracker: bank points balances + KrisFlyer/etc conversion, plus a goal/display-program setting
-- Run after 040_investment_funds.sql

create table if not exists miles_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  points_balance numeric not null default 0,
  expiring_amount numeric,
  expiry_date date,
  -- points needed per 1 mile, keyed by program, e.g. { "krisflyer": 0.5, "asiaMiles": null }
  rates jsonb not null default '{}'::jsonb,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists miles_balances_user_idx
  on miles_balances (user_id, sort_order);

alter table miles_balances enable row level security;

create policy "Users manage own miles balances"
  on miles_balances for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Miles goal + preferred display program (small settings object, same pattern as bto_planner)
alter table user_finance_profile
  add column if not exists miles_planner jsonb not null default '{}'::jsonb;
