-- Link personal loan payments to savings withdrawals for payment history.

alter table savings_transactions
  drop constraint if exists savings_transactions_source_record_type_check;

alter table savings_transactions
  add constraint savings_transactions_source_record_type_check
  check (
    source_record_type is null
    or source_record_type in ('expense', 'savings', 'budget', 'other_loan')
  );
