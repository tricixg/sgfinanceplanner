-- Other loans (personal, balance transfer, etc.) — not monthly instalment plans
-- Run after 018_card_statement_minimum_due.sql

create table if not exists other_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  loan_type text not null default 'personal' check (
    loan_type in ('personal', 'balance_transfer')
  ),
  principal numeric not null default 0,
  outstanding numeric not null default 0,
  interest_rate_apr numeric not null default 0,
  tenure_months int,
  fees_paid numeric not null default 0,
  due_date date,
  source_credit_card_id uuid references credit_cards (id) on delete set null,
  default_financial_account_id uuid references financial_accounts (id) on delete set null,
  amount_paid numeric not null default 0,
  paid_at timestamptz,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists other_loans_user_idx
  on other_loans (user_id, sort_order);

create index if not exists other_loans_bt_card_idx
  on other_loans (user_id, source_credit_card_id)
  where loan_type = 'balance_transfer' and paid_at is null;

alter table other_loans enable row level security;

create policy "Users manage own other loans"
  on other_loans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
