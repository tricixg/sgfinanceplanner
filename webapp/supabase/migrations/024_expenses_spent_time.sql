-- Expense time-of-day for accurate transaction ordering/display
-- Run after 023_travel.sql

alter table expenses
  add column if not exists spent_time time;

create index if not exists expenses_user_spent_datetime_idx
  on expenses (user_id, spent_at desc, spent_time desc nulls last, id desc);
