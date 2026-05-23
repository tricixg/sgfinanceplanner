-- Link ledger rows created when recording an expense (pay-from account)
-- Run after 014_recurring_default_account.sql

alter table savings_transactions
  add column if not exists expense_id uuid references expenses (id) on delete set null;

alter table budget_transactions
  add column if not exists expense_id uuid references expenses (id) on delete set null;

create index if not exists savings_transactions_expense_idx
  on savings_transactions (expense_id)
  where expense_id is not null;

create index if not exists budget_transactions_expense_idx
  on budget_transactions (expense_id)
  where expense_id is not null;
