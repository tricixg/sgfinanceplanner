-- Optional start month (YYYY-MM) for instalment plans, used to show a progress bar.
alter table loans
  add column if not exists start_ym text;
