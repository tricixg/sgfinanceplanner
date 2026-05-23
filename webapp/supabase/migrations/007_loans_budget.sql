-- Loans and budget lines (normalized)
-- Run after 006_credit_cards.sql

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  card_label text not null default '',
  credit_card_id uuid references credit_cards (id) on delete set null,
  monthly numeric not null default 0,
  outstanding numeric not null default 0,
  end_ym text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loans_user_idx on loans (user_id, sort_order);

create table if not exists budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null default '',
  amount numeric not null default 0,
  line_type text not null check (line_type in ('fixed', 'spend', 'save', 'invest')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_lines_user_idx on budget_lines (user_id, sort_order);

alter table loans enable row level security;
alter table budget_lines enable row level security;

create policy "Users manage own loans"
  on loans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users manage own budget lines"
  on budget_lines for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
