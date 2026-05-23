-- Per-user dashboard state with Supabase Auth (magic link / email OTP)
-- Run in Supabase SQL Editor after 001_dashboard_state.sql

-- Preserve legacy singleton row for manual migration (optional)
alter table if exists dashboard_state rename to dashboard_state_legacy;

create table if not exists dashboard_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table dashboard_state enable row level security;

create policy "Users can read own dashboard"
  on dashboard_state
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own dashboard"
  on dashboard_state
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own dashboard"
  on dashboard_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own dashboard"
  on dashboard_state
  for delete
  using (auth.uid() = user_id);

-- Optional: copy old shared data to your account (replace YOUR_USER_UUID)
-- insert into dashboard_state (user_id, data, updated_at)
-- select
--   'YOUR_USER_UUID'::uuid,
--   data,
--   coalesce(updated_at, now())
-- from dashboard_state_legacy
-- where id = 'default'
-- on conflict (user_id) do update
--   set data = excluded.data,
--       updated_at = excluded.updated_at;

-- drop table dashboard_state_legacy;  -- after you confirm migration
