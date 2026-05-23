-- Credit cards (normalized; replaces dashboard_state.creditCards)
-- Run after 005_financial_accounts_budget.sql

create table if not exists credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_key text not null,
  name text not null default '',
  statement_day int not null default 1,
  payment_due_day int not null default 1,
  statement_amount numeric not null default 0,
  include_outstanding_on_statement boolean not null default false,
  catalog_id text,
  bank text,
  reward_type text,
  reward_headline text,
  reward_rules jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  financial_account_id uuid references financial_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists credit_cards_user_card_key_uidx
  on credit_cards (user_id, card_key);

create index if not exists credit_cards_user_idx
  on credit_cards (user_id, sort_order);

alter table credit_cards enable row level security;

create policy "Users manage own credit cards"
  on credit_cards for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
