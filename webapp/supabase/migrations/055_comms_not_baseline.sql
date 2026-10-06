-- Move "Communication" income out of baseline pay and treat it as
-- additive/claim-like income instead, since it's now tracked as a
-- monthly-resetting benefit (see the benefits table) rather than a
-- guaranteed part of take-home salary.
-- Run after 054_benefits_cycle_frequency.sql

update income_categories
set counts_in_baseline = false,
    counts_as_additive = true,
    updated_at = now()
where slug = 'comms';
