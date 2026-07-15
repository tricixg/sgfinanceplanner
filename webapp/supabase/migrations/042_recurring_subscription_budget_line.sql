-- Link recurring subscriptions to a real budget category instead of an
-- auto-computed "Other Recurring" line. Run after 041_miles_tracker.sql

alter table recurring_subscriptions
  add column if not exists budget_line_id uuid references budget_lines (id) on delete set null;
