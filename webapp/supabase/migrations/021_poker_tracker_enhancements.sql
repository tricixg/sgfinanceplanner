-- Poker tracker: session types, locations, cash games, tournament fields

create table if not exists poker_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists poker_locations_user_idx on poker_locations (user_id, name);

alter table poker_locations enable row level security;

create policy poker_locations_own on poker_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists poker_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  small_blind numeric not null default 0,
  big_blind numeric not null default 0,
  ante numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poker_games_user_idx on poker_games (user_id, name);

alter table poker_games enable row level security;

create policy poker_games_own on poker_games
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table poker_sessions
  add column if not exists session_type text not null default 'cash_game',
  add column if not exists location text not null default '',
  add column if not exists tournament_name text,
  add column if not exists game_id uuid references poker_games (id) on delete set null,
  add column if not exists event_name text,
  add column if not exists tournament_result text,
  add column if not exists tournament_place integer,
  add column if not exists tournament_entries integer,
  add column if not exists amount_won numeric;

update poker_sessions
set location = venue
where (location is null or location = '') and venue is not null and venue <> '';

alter table poker_sessions
  drop constraint if exists poker_sessions_session_type_check;

alter table poker_sessions
  add constraint poker_sessions_session_type_check
  check (session_type in ('cash_game', 'tournament'));

alter table poker_sessions
  drop constraint if exists poker_sessions_tournament_result_check;

alter table poker_sessions
  add constraint poker_sessions_tournament_result_check
  check (tournament_result is null or tournament_result in ('placed', 'busted'));
