-- Auto-category payments (debt, insurance, ILP) linked to source records
-- Run after 011_expenses_budget_link.sql

alter table expenses
  add column if not exists auto_category text check (auto_category in ('debt', 'insurance', 'ilp')),
  add column if not exists loan_id uuid references loans (id) on delete set null,
  add column if not exists insurance_policy_id uuid references insurance_policies (id) on delete set null,
  add column if not exists ilp_policy_id uuid references ilp_policies (id) on delete set null;

create index if not exists expenses_user_auto_category_spent_idx
  on expenses (user_id, auto_category, spent_at desc)
  where auto_category is not null;
