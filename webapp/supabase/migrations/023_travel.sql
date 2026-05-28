create table if not exists travel_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  country text not null default '',
  start_date date not null,
  end_date date not null,
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'completed')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_trips_date_range_chk check (end_date >= start_date)
);

create table if not exists travel_trip_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null references travel_trips (id) on delete cascade,
  sub_category text not null default '',
  budget_amount numeric not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_trips_user_dates_idx
  on travel_trips (user_id, start_date, end_date);

create index if not exists travel_trip_budgets_user_trip_idx
  on travel_trip_budgets (user_id, trip_id, sort_order);

alter table travel_trips enable row level security;
alter table travel_trip_budgets enable row level security;

create policy "Users manage own travel trips"
  on travel_trips for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own travel trip budgets"
  on travel_trip_budgets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
