-- Date each CPF contribution was credited (SGT), shown in CPF Outlook's OA
-- history. `month` stays the month the contribution is for. Older rows stay
-- null and display by month. Run after 064_cpf_transactions.sql.

alter table cpf_contributions
  add column if not exists credited_on date;
