-- Recurring subscriptions + deduction day + expense payment source
-- Run after 012_auto_expense_payments.sql

create table if not exists recurring_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  amount numeric not null default 0,
  notes text not null default '',
  deduction_day smallint check (deduction_day between 1 and 31),
  default_financial_account_id uuid references financial_accounts (id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_subscriptions_user_idx
  on recurring_subscriptions (user_id, sort_order);

alter table recurring_subscriptions enable row level security;

create policy recurring_subscriptions_own on recurring_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table loans
  add column if not exists deduction_day smallint check (deduction_day between 1 and 31);

alter table insurance_policies
  add column if not exists deduction_day smallint check (deduction_day between 1 and 31);

alter table ilp_policies
  add column if not exists deduction_day smallint check (deduction_day between 1 and 31);

alter table expenses
  add column if not exists subscription_id uuid references recurring_subscriptions (id) on delete set null,
  add column if not exists financial_account_id uuid references financial_accounts (id) on delete set null;

alter table expenses drop constraint if exists expenses_auto_category_check;

alter table expenses add constraint expenses_auto_category_check
  check (auto_category in ('debt', 'insurance', 'ilp', 'subscription'));

create index if not exists expenses_subscription_id_idx
  on expenses (subscription_id)
  where subscription_id is not null;
