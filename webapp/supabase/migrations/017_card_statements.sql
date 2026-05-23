-- Card statement cycles, payments, and interest (run after 016_income_categories.sql)

alter table credit_cards
  add column if not exists interest_rate_apr numeric not null default 0;

create table if not exists card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  credit_card_id uuid not null references credit_cards (id) on delete cascade,
  statement_close_date date not null,
  cycle_start_date date not null,
  cycle_end_date date not null,
  payment_due_date date not null,
  carried_forward_in numeric not null default 0,
  actual_amount numeric,
  tracked_amount numeric,
  amount_paid numeric not null default 0,
  interest_accrued numeric not null default 0,
  paid_at timestamptz,
  payment_financial_account_id uuid references financial_accounts (id) on delete set null,
  payment_savings_transaction_id uuid references savings_transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists card_statements_card_close_uidx
  on card_statements (credit_card_id, statement_close_date);

create index if not exists card_statements_user_card_idx
  on card_statements (user_id, credit_card_id, statement_close_date desc);

alter table card_statements enable row level security;

create policy "Users manage own card statements"
  on card_statements for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
