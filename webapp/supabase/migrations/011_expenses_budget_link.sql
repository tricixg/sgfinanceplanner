-- Link manual expenses and budget CSV imports to budget_lines categories
-- Run after 010_poker_sessions.sql

alter table expenses
  add column if not exists budget_line_id uuid references budget_lines (id) on delete set null;

create index if not exists expenses_user_budget_line_spent_idx
  on expenses (user_id, budget_line_id, spent_at desc)
  where budget_line_id is not null;

alter table budget_transactions
  add column if not exists budget_line_id uuid references budget_lines (id) on delete set null;

create index if not exists budget_transactions_user_budget_line_spent_idx
  on budget_transactions (user_id, budget_line_id, spent_at desc)
  where budget_line_id is not null;
