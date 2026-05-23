-- Income categories for cash deposits and hybrid cashflow
-- Run after 015_expense_ledger_link.sql

create table if not exists income_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  slug text not null default '',
  sort_order int not null default 0,
  counts_in_baseline boolean not null default false,
  counts_as_additive boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists income_categories_user_slug_uidx
  on income_categories (user_id, slug);

create index if not exists income_categories_user_sort_idx
  on income_categories (user_id, sort_order);

alter table income_categories enable row level security;

create policy "Users manage own income categories"
  on income_categories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table savings_transactions
  add column if not exists income_category_id uuid references income_categories (id) on delete set null;

alter table savings_transactions
  add column if not exists exclude_from_budget boolean not null default false;

create index if not exists savings_transactions_income_category_idx
  on savings_transactions (income_category_id)
  where income_category_id is not null;

alter table poker_sessions
  add column if not exists financial_account_id uuid references financial_accounts (id) on delete set null;

alter table poker_sessions
  add column if not exists savings_transaction_id uuid references savings_transactions (id) on delete set null;

create index if not exists poker_sessions_savings_tx_idx
  on poker_sessions (savings_transaction_id)
  where savings_transaction_id is not null;
