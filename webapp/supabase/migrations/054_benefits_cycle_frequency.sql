-- Revert benefits' cycle model from stored start/end dates (053) back to a
-- frequency: cycle_months (null = one-time) + cycle_anchor_date, with the
-- app computing the current cycle window on the fly instead of persisting
-- it. A fixed "roll forward 12 months" step (053's behavior) doesn't fit
-- non-annual benefits — e.g. Communication moving out of baseline income
-- to be tracked as a benefit that resets monthly — so the frequency itself
-- needs to drive the rollover step, not a hardcoded 12.
--
-- Existing cycle_end_date values were set as the last *inclusive* day of
-- the cycle (e.g. 2026-06-01 → 2027-05-31 for an annual benefit), so
-- cycle_months is derived from the gap to end_date + 1 day, which recovers
-- the intended whole-month frequency.
--
-- Safe to run whether `benefits` currently has cycle_start_date/
-- cycle_end_date (053 applied) or still has cycle_months/cycle_anchor_date
-- (053 never applied) — the block below only acts when the date columns
-- are present.
-- Run after 053_benefits_cycle_dates.sql

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'benefits' and column_name = 'cycle_start_date'
  ) then
    alter table benefits add column if not exists cycle_months int;
    alter table benefits add column if not exists cycle_anchor_date date;

    update benefits
    set
      cycle_anchor_date = cycle_start_date,
      cycle_months = case
        when cycle_end_date is null then null
        else greatest(1, round(
          extract(year from age(cycle_end_date + 1, cycle_start_date)) * 12
          + extract(month from age(cycle_end_date + 1, cycle_start_date))
        )::int)
      end
    where cycle_anchor_date is null;

    alter table benefits alter column cycle_anchor_date set default current_date;
    alter table benefits alter column cycle_anchor_date set not null;

    alter table benefits drop column if exists cycle_start_date;
    alter table benefits drop column if exists cycle_end_date;
  end if;
end $$;
