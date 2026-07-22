-- Recurring investment contributions — like recurring_subscriptions, but each
-- item routes into a specific investment fund on payment. Run after
-- 042_recurring_subscription_budget_line.sql

create table if not exists recurring_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  amount numeric not null default 0,
  notes text not null default '',
  deduction_day smallint check (deduction_day between 1 and 31),
  default_financial_account_id uuid references financial_accounts (id) on delete set null,
  fund_id uuid not null references investment_funds (id) on delete cascade,
  budget_line_id uuid references budget_lines (id) on delete set null,
  end_month text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_investments_user_idx
  on recurring_investments (user_id, sort_order);

alter table recurring_investments enable row level security;

create policy recurring_investments_own on recurring_investments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table expenses
  add column if not exists investment_id uuid references recurring_investments (id) on delete set null,
  add column if not exists fund_id uuid references investment_funds (id) on delete set null;

alter table expenses drop constraint if exists expenses_auto_category_check;

alter table expenses add constraint expenses_auto_category_check
  check (auto_category in ('debt', 'insurance', 'ilp', 'subscription', 'invest'));
