-- Add start_date to savings_goals for pre-planning a future saving period.
alter table savings_goals
  add column if not exists start_date date;
