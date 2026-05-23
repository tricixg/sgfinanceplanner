-- Poker session tracker (personal, paginated in app)

create table if not exists poker_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  played_at date not null,
  buy_in numeric not null,
  cash_out numeric not null default 0,
  venue text not null default '',
  hours numeric,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poker_sessions_user_played_at_idx
  on poker_sessions (user_id, played_at desc, id desc);

alter table poker_sessions enable row level security;

create policy "Users manage own poker sessions"
  on poker_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
