-- Optional plan terms for instalment plans: start month (YYYY-MM), original
-- principal and tenure in months. Used for the months-left progress bar.
alter table loans
  add column if not exists start_ym text,
  add column if not exists principal numeric,
  add column if not exists tenure_months integer check (tenure_months is null or tenure_months > 0);
