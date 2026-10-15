-- Buy Now Pay Later plans — fixed-tenure instalment purchases, tracked
-- separately from open-ended recurring subscriptions/investments because
-- they have a total amount and a known number of months to pay off.
-- Run after 056_money_columns_2dp.sql

create table if not exists bnpl_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  total_amount numeric(14, 2) not null default 0,
  tenure_months smallint not null default 1 check (tenure_months > 0),
  amount numeric(14, 2) not null default 0,
  months_paid smallint not null default 0 check (months_paid >= 0),
  deduction_day smallint check (deduction_day between 1 and 31),
  default_financial_account_id uuid references financial_accounts (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bnpl_plans_user_idx
  on bnpl_plans (user_id, sort_order);

alter table bnpl_plans enable row level security;

create policy bnpl_plans_own on bnpl_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table expenses
  add column if not exists bnpl_id uuid references bnpl_plans (id) on delete set null;

alter table expenses drop constraint if exists expenses_auto_category_check;

alter table expenses add constraint expenses_auto_category_check
  check (auto_category in ('debt', 'insurance', 'ilp', 'subscription', 'invest', 'bnpl'));

create index if not exists expenses_bnpl_id_idx
  on expenses (bnpl_id)
  where bnpl_id is not null;
