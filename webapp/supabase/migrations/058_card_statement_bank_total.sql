-- Statement amount entered as the bank's full statement balance (run after 057_bnpl_plans.sql).
-- When true, actual_amount already includes the previous unpaid balance and any
-- balance transfer, so carried_forward_in is not added on top. Existing rows stay
-- false (amount = new charges only; previous balance carried separately).

alter table card_statements
  add column if not exists amount_includes_prior_balance boolean not null default false;
