-- User finance profile, insurance, ILP
-- Run after 008_holdings_portfolio.sql

create table if not exists user_finance_profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  monthly_sal numeric not null default 0,
  comms numeric not null default 0,
  salary_credit_day int not null default 25,
  oa numeric not null default 0,
  sa numeric not null default 0,
  ma numeric not null default 0,
  moo numeric not null default 0,
  margin numeric not null default 0,
  cash numeric not null default 0,
  cc_debt numeric not null default 0,
  cashflow_start_ym text not null default '',
  bto_planner jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  insurer text not null default '',
  monthly_premium numeric not null default 0,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists insurance_policies_user_idx
  on insurance_policies (user_id, sort_order);

create table if not exists ilp_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  insurer text not null default '',
  plan_name text not null default '',
  policy_no text not null default '',
  premium_type text not null default 'regular',
  loading_type text not null default 'front-end',
  monthly_premium numeric not null default 0,
  initial_bonus numeric not null default 0,
  account_value numeric not null default 0,
  premium_allocation_pct numeric not null default 100,
  lock_in_end_ym text not null default '',
  policy_start_ym text not null default '',
  surrender_charge_end_ym text not null default '',
  insurance_cover numeric not null default 0,
  funds text not null default '',
  free_fund_switches_per_year int not null default 0,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ilp_policies_user_idx on ilp_policies (user_id, sort_order);

alter table user_finance_profile enable row level security;
alter table insurance_policies enable row level security;
alter table ilp_policies enable row level security;

create policy "Users manage own finance profile"
  on user_finance_profile for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own insurance policies"
  on insurance_policies for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own ilp policies"
  on ilp_policies for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
