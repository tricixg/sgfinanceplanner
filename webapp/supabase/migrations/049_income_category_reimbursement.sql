-- Rename the "Comms" income category to "Communication" and add a
-- "Reimbursement" income category so reimbursement deposits can be tagged
-- as either Reimbursement or Communication (instead of inheriting the
-- source expense's category or landing uncategorized).
-- Run after 048_household_bto_planner.sql

update income_categories
set name = 'Communication', updated_at = now()
where slug = 'comms' and name = 'Comms';

insert into income_categories (user_id, name, slug, sort_order, counts_in_baseline, counts_as_additive)
select distinct ic.user_id, 'Reimbursement', 'reimbursement', 4, false, true
from income_categories ic
where not exists (
  select 1 from income_categories x
  where x.user_id = ic.user_id and x.slug = 'reimbursement'
);
