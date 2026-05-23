-- Per-loan opt-out from net worth liability (personal loans only in UI)
-- Run after 019_other_loans.sql

alter table other_loans
  add column if not exists exclude_from_net_worth boolean not null default false;
