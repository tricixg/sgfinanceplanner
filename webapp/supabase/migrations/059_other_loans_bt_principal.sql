-- New balance transfers post their principal as card spend and deposit the funds
-- into a cash account (run after 058_card_statement_bank_total.sql). Existing BTs
-- have neither link and are left unchanged.

alter table other_loans
  add column if not exists bt_principal_expense_id uuid references expenses (id) on delete set null,
  add column if not exists bt_deposit_transaction_id uuid references savings_transactions (id) on delete set null;
