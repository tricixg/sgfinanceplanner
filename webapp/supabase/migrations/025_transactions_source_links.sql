alter table savings_transactions
  add column if not exists source_record_type text
    check (source_record_type in ('expense', 'savings', 'budget')),
  add column if not exists source_record_id uuid;

alter table budget_transactions
  add column if not exists source_record_type text
    check (source_record_type in ('expense', 'savings', 'budget')),
  add column if not exists source_record_id uuid;

create index if not exists savings_transactions_source_record_idx
  on savings_transactions (user_id, source_record_type, source_record_id)
  where source_record_type is not null and source_record_id is not null;

create index if not exists budget_transactions_source_record_idx
  on budget_transactions (user_id, source_record_type, source_record_id)
  where source_record_type is not null and source_record_id is not null;
