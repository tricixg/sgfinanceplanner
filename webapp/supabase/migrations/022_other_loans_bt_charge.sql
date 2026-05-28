alter table if exists other_loans
  add column if not exists bt_start_date date,
  add column if not exists finance_charge numeric not null default 0,
  add column if not exists finance_charge_expense_id uuid references expenses (id) on delete set null;

create index if not exists other_loans_bt_charge_expense_idx
  on other_loans (user_id, finance_charge_expense_id)
  where loan_type = 'balance_transfer';
