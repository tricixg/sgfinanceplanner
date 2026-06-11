-- Link companion settlements to cash account deposits when reimbursement is received.

alter table travel_companion_settlements
  add column if not exists financial_account_id uuid references financial_accounts (id) on delete set null,
  add column if not exists savings_transaction_id uuid references savings_transactions (id) on delete set null;

create index if not exists travel_companion_settlements_savings_txn_idx
  on travel_companion_settlements (savings_transaction_id)
  where savings_transaction_id is not null;
