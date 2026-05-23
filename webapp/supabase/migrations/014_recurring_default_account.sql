-- Default pay-from account on recurring sources (configure on Debt / ME / Investment tabs)
-- Run after 013_recurring_subscriptions.sql

alter table loans
  add column if not exists default_financial_account_id uuid references financial_accounts (id) on delete set null;

alter table insurance_policies
  add column if not exists default_financial_account_id uuid references financial_accounts (id) on delete set null;

alter table ilp_policies
  add column if not exists default_financial_account_id uuid references financial_accounts (id) on delete set null;
