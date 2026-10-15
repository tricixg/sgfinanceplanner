-- Store money balances at exactly 2 decimal places.
-- Balances are computed in JS (floating point), so values like
-- 474.79999999999995 were being saved and then failed "Insufficient balance"
-- checks even though the UI showed 474.80. numeric(14,2) makes Postgres round
-- every write to cents, and the type change rounds existing rows too.
-- Run after 055_comms_not_baseline.sql

alter table user_savings_accounts
  alter column balance type numeric(14, 2) using round(balance, 2);

alter table savings_pools
  alter column balance type numeric(14, 2) using round(balance, 2);

alter table savings_goals
  alter column saved_amount type numeric(14, 2) using round(saved_amount, 2);

alter table savings_transactions
  alter column amount type numeric(14, 2) using round(amount, 2),
  alter column balance_after type numeric(14, 2) using round(balance_after, 2);

alter table investment_funds
  alter column balance type numeric(14, 2) using round(balance, 2);

alter table fund_transactions
  alter column amount type numeric(14, 2) using round(amount, 2),
  alter column balance_after type numeric(14, 2) using round(balance_after, 2);
