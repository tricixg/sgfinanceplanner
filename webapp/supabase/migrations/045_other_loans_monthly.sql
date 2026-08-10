-- Monthly instalment amount for personal loans, folded into the Debts & Loans
-- auto-calculated budget row alongside credit-card instalment loans.

alter table other_loans add column if not exists monthly numeric not null default 0;

-- Traces a "debt" auto-category expense back to the personal loan it paid off,
-- mirroring the existing loans.id link via expenses.loan_id.
alter table expenses add column if not exists other_loan_id uuid
  references other_loans (id) on delete set null;

create index if not exists expenses_other_loan_idx
  on expenses (user_id, other_loan_id) where other_loan_id is not null;
