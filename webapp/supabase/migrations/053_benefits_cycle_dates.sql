-- Replace benefits.cycle_months + cycle_anchor_date with explicit, freely
-- editable cycle_start_date / cycle_end_date columns, and let limit_amount
-- be null (no cap) instead of always a number. cycle_end_date null = a
-- one-time allowance that never resets; once it's in the past the app
-- rolls it forward (+12 months) and persists the new bounds on next load,
-- which stay user-editable from there.
-- Safe to run whether `benefits` still has the old columns (052 as
-- originally applied) or already has the new ones (052 as later rewritten
-- for fresh installs) — every step below is a no-op in the latter case.
-- Run after 052_benefits.sql

alter table benefits add column if not exists cycle_start_date date;
alter table benefits add column if not exists cycle_end_date date;

update benefits
set
  cycle_start_date = coalesce(cycle_anchor_date, current_date),
  cycle_end_date = case
    when cycle_months is null then null
    else (coalesce(cycle_anchor_date, current_date) + (cycle_months::text || ' months')::interval)::date
  end
where cycle_start_date is null;

alter table benefits alter column cycle_start_date set default current_date;
alter table benefits alter column cycle_start_date set not null;

alter table benefits drop column if exists cycle_months;
alter table benefits drop column if exists cycle_anchor_date;

alter table benefits alter column limit_amount drop not null;
alter table benefits alter column limit_amount drop default;
