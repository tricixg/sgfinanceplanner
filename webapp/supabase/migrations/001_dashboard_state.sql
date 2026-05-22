-- Run once in Supabase SQL editor or via CLI
create table if not exists dashboard_state (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz default now()
);

insert into dashboard_state (id, data)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;
