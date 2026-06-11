create table if not exists travel_trip_companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references travel_trips (id) on delete cascade,
  name text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists travel_expense_splits (
  expense_id uuid primary key references expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references travel_trips (id) on delete cascade,
  paid_by_companion_id uuid references travel_trip_companions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists travel_expense_split_shares (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  companion_id uuid references travel_trip_companions (id) on delete cascade,
  share_amount numeric not null default 0 check (share_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_expense_split_shares_unique unique (expense_id, companion_id)
);

create table if not exists travel_companion_settlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references travel_trips (id) on delete cascade,
  companion_id uuid not null references travel_trip_companions (id) on delete cascade,
  direction text not null check (direction in ('received', 'paid')),
  amount numeric not null check (amount > 0),
  settled_at date not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_trip_companions_user_trip_idx
  on travel_trip_companions (user_id, trip_id, sort_order);

create index if not exists travel_expense_splits_user_trip_idx
  on travel_expense_splits (user_id, trip_id);

create index if not exists travel_expense_split_shares_expense_idx
  on travel_expense_split_shares (expense_id);

create index if not exists travel_companion_settlements_user_trip_idx
  on travel_companion_settlements (user_id, trip_id, companion_id);

alter table travel_trip_companions enable row level security;
alter table travel_expense_splits enable row level security;
alter table travel_expense_split_shares enable row level security;
alter table travel_companion_settlements enable row level security;

create policy "Users manage own travel companions"
  on travel_trip_companions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own travel expense splits"
  on travel_expense_splits for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own travel expense split shares"
  on travel_expense_split_shares for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own travel companion settlements"
  on travel_companion_settlements for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
