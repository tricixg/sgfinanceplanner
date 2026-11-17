-- Date each CPF contribution was credited (SGT), shown in CPF Outlook's OA
-- history. `month` stays the month the contribution is for. Run after
-- 064_cpf_transactions.sql.

alter table cpf_contributions
  add column if not exists credited_on date;

-- Backfill older rows with the day they were logged (Singapore time). Only
-- fills blanks, so it's safe to re-run and never overwrites a real date.
update cpf_contributions
set credited_on = (created_at at time zone 'Asia/Singapore')::date
where credited_on is null;
