-- Monthly budgets: per-month snapshots of the budget.
-- Run after 062_card_statement_reimbursement_credits.sql
--
-- budget_lines stays the category catalog (stable ids, name, type).
-- budget_months holds one header row per user per saved month.
-- budget_line_months holds amount + order per category per saved month.

create table if not exists budget_months (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

create table if not exists budget_line_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  budget_line_id uuid not null references budget_lines (id) on delete cascade,
  month text not null,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (budget_line_id, month),
  foreign key (user_id, month) references budget_months (user_id, month) on delete cascade
);

create index if not exists budget_line_months_user_month_idx
  on budget_line_months (user_id, month, sort_order);

alter table budget_months enable row level security;
alter table budget_line_months enable row level security;

drop policy if exists "Users manage own budget months" on budget_months;
create policy "Users manage own budget months"
  on budget_months for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users manage own budget line months" on budget_line_months;
create policy "Users manage own budget line months"
  on budget_line_months for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on column budget_lines.amount is
  'DEPRECATED since 063 — amounts live in budget_line_months';

-- Backfill: one baseline snapshot per user, dated the month before this runs
-- (Singapore time), copied from today's budget_lines amounts. Users who already
-- have any budget_months row are skipped, so running the file twice seeds nobody.
with baseline as (
  select to_char(
    date_trunc('month', now() at time zone 'Asia/Singapore') - interval '1 month',
    'YYYY-MM'
  ) as month
),
seeded as (
  insert into budget_months (user_id, month)
  select distinct bl.user_id, baseline.month
  from budget_lines bl
  cross join baseline
  where bl.line_type <> 'save'
    and not exists (select 1 from budget_months bm where bm.user_id = bl.user_id)
  returning user_id, month
)
insert into budget_line_months (user_id, budget_line_id, month, amount, sort_order)
select bl.user_id, bl.id, s.month, round(greatest(bl.amount, 0), 2), bl.sort_order
from budget_lines bl
join seeded s on s.user_id = bl.user_id
where bl.line_type <> 'save'
on conflict do nothing;
