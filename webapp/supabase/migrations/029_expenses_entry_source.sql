-- How an expense row was created (shown in Expenses tab Source column).

alter table expenses
  add column if not exists entry_source text not null default 'manual';

alter table expenses drop constraint if exists expenses_entry_source_check;

alter table expenses add constraint expenses_entry_source_check
  check (entry_source in ('manual', 'telegram', 'recurring'));

create index if not exists expenses_user_entry_source_idx
  on expenses (user_id, entry_source, spent_at desc);
