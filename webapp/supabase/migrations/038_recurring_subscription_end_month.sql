-- Add end_month (YYYY-MM) to recurring_subscriptions.
-- When set, the item is treated as ended after that month
-- and moved to the archive section in the UI.

alter table recurring_subscriptions
  add column if not exists end_month text
    check (end_month is null or end_month ~ '^\d{4}-\d{2}$');
