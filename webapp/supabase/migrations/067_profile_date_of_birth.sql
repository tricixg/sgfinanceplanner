-- Date of birth on the finance profile, used to pick age-based CPF
-- contribution and allocation rates (35 / 45 / 50 / 55 / 60 / 65 bands).
-- Nullable: without it the app keeps assuming the "35 and below" rates.
-- Idempotent — safe to run more than once.
-- Run after 066_household_membership_hardening.sql

alter table user_finance_profile
  add column if not exists date_of_birth date;
