-- Non-destructive "hide" toggle for credit_cards, user_savings_accounts, and
-- investment_funds. Replaces removing a row from the edit list (which used to
-- hard-delete it and cascade into card_statements / savings_transactions /
-- fund_transactions history) with a reversible hidden flag. Hidden rows are
-- still saved/updated normally and still count toward totals — they're only
-- left out of the card/account/fund list views, with an unhide toggle
-- available from Edit. Run after 049_income_category_reimbursement.sql

alter table credit_cards add column if not exists hidden boolean not null default false;
alter table user_savings_accounts add column if not exists hidden boolean not null default false;
alter table investment_funds add column if not exists hidden boolean not null default false;
