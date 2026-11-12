-- Tracks reimbursements applied toward a credit card statement (e.g. a refund
-- credited directly on the card, which should count as a payment against the
-- outstanding balance). Mirrors benefit_claims (052_benefits.sql): a credit can
-- optionally link back to the reimbursement ledger row (savings_transactions/
-- budget_transactions) that created it, so deleting that row reverses the credit.
-- This is separate from card_statements.payment_savings_transaction_id, which
-- stays reserved for the real-cash "Pay" flow — a statement can accumulate
-- multiple independent reimbursement credits, each individually reversible.
-- Run after 061_poker_online_locations.sql

create table if not exists card_statement_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_statement_id uuid not null references card_statements (id) on delete cascade,
  amount numeric(12, 2) not null,
  credited_at date not null default current_date,
  note text not null default '',
  source_record_type text,
  source_record_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists card_statement_credits_statement_idx
  on card_statement_credits (card_statement_id);

create index if not exists card_statement_credits_source_idx
  on card_statement_credits (source_record_type, source_record_id)
  where source_record_type is not null;

alter table card_statement_credits enable row level security;

create policy "Users manage own card statement credits"
  on card_statement_credits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
