-- Add "Transport Claims" and "Medical Claims" income categories so
-- transport/medical expense reimbursements can be tagged distinctly
-- (selectable as reimburse categories like Communication) instead of
-- landing under the generic Reimbursement bucket. Additive cashflow like
-- Reimbursement, not baseline, since claims are irregular, not recurring
-- salary-like income.
-- Run after 050_hidden_flag.sql

insert into income_categories (user_id, name, slug, sort_order, counts_in_baseline, counts_as_additive)
select distinct ic.user_id, 'Transport Claims', 'transport-claims', 5, false, true
from income_categories ic
where not exists (
  select 1 from income_categories x
  where x.user_id = ic.user_id and x.slug = 'transport-claims'
);

insert into income_categories (user_id, name, slug, sort_order, counts_in_baseline, counts_as_additive)
select distinct ic.user_id, 'Medical Claims', 'medical-claims', 6, false, true
from income_categories ic
where not exists (
  select 1 from income_categories x
  where x.user_id = ic.user_id and x.slug = 'medical-claims'
);
