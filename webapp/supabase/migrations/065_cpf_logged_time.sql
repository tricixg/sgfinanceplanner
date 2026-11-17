-- Date & time each CPF entry happened (SGT wall clock), like expenses.spent_time.
-- Run after 064_cpf_transactions.sql.
--
-- cpf_transactions already has txn_date; add the time of day.
-- cpf_contributions keeps `month` (the month the contribution is for) and gains
-- the date/time it was credited. Older rows stay null and display by month.

alter table cpf_transactions
  add column if not exists txn_time time;

alter table cpf_contributions
  add column if not exists credited_on date,
  add column if not exists credited_time time;

create index if not exists cpf_transactions_user_datetime_idx
  on cpf_transactions (user_id, txn_date desc, txn_time desc nulls last);
