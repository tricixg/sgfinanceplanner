-- Unified financial accounts (cash + credit cards) and budget-style transactions
-- Run after 004_accounts_ledger.sql

create table if not exists financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  account_type text not null check (account_type in ('cash', 'credit_card')),
  savings_account_id uuid references user_savings_accounts (id) on delete cascade,
  card_key text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists financial_accounts_savings_uidx
  on financial_accounts (user_id, savings_account_id)
  where savings_account_id is not null;

create unique index if not exists financial_accounts_card_key_uidx
  on financial_accounts (user_id, card_key)
  where card_key is not null and card_key <> '';

create index if not exists financial_accounts_user_idx
  on financial_accounts (user_id, sort_order);

create table if not exists budget_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  financial_account_id uuid references financial_accounts (id) on delete set null,
  ledger text not null default '',
  category text not null default '',
  subcategory text not null default '',
  currency text not null default 'SGD',
  amount numeric not null,
  recorder text not null default '',
  spent_at date not null,
  spent_time time,
  tag text not null default '',
  note text not null default '',
  transaction_type text not null check (
    transaction_type in ('expense', 'subscription', 'income')
  ),
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists budget_transactions_user_spent_idx
  on budget_transactions (user_id, spent_at desc, spent_time desc nulls last, id desc);

create index if not exists budget_transactions_account_idx
  on budget_transactions (financial_account_id, spent_at desc)
  where financial_account_id is not null;

create index if not exists budget_transactions_import_batch_idx
  on budget_transactions (user_id, import_batch_id)
  where import_batch_id is not null;

alter table financial_accounts enable row level security;
alter table budget_transactions enable row level security;

create policy "Users manage own financial accounts"
  on financial_accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own budget transactions"
  on budget_transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
