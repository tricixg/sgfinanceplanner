-- Dividend payouts for stock holdings (realized P&L on the Investment tab)
-- Run after 043_recurring_investments.sql

create table if not exists holding_dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  holding_id uuid not null references holdings (id) on delete cascade,
  per_share numeric not null check (per_share > 0),
  qty numeric not null,
  amount numeric not null,
  occurred_at date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists holding_dividends_holding_idx
  on holding_dividends (holding_id, occurred_at desc);

alter table holding_dividends enable row level security;

create policy "Users manage own holding dividends"
  on holding_dividends for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from holdings h
      where h.id = holding_id and h.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from holdings h
      where h.id = holding_id and h.user_id = auth.uid()
    )
  );
