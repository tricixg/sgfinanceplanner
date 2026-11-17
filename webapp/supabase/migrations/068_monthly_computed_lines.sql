-- FIN-005: freeze the computed monthly lines of finished months.
-- Run after 067_profile_date_of_birth.sql
--
-- Insurance premiums, ILP premiums and the loan load are derived from current
-- settings, so editing a premium or removing a loan used to rewrite every past
-- month's budget and cashflow. This table holds one frozen row per user per
-- finished month (like budget_months.monthly_salary for salary). Current and
-- future months keep following live settings. The month-end job writes the
-- row for the month that just ended; a month without a row falls back to live
-- settings, exactly as before.
--
-- Idempotent: safe to run more than once.

create table if not exists monthly_computed_lines (
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  insurance numeric(14, 2) not null default 0 check (insurance >= 0),
  ilp numeric(14, 2) not null default 0 check (ilp >= 0),
  -- instalment plans still running that month + unpaid personal loans
  debt numeric(14, 2) not null default 0 check (debt >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table monthly_computed_lines enable row level security;

drop policy if exists "Users manage own computed lines" on monthly_computed_lines;
create policy "Users manage own computed lines"
  on monthly_computed_lines for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Backfill: every finished month from the user's first saved month (earliest
-- budget_months row or cashflow start month) up to last month (Singapore time)
-- is frozen at TODAY'S settings — so nothing displayed changes now, and from
-- here on those months no longer follow later edits. Users with no history and
-- months that already have a row are left alone, so re-running seeds nothing.
-- The loan rule mirrors the app: a loan counts for months up to and including
-- its end month; personal loans count while unpaid.
with cur as (
  select to_char(date_trunc('month', now() at time zone 'Asia/Singapore'), 'YYYY-MM') as ym
),
firsts as (
  select user_id, min(month) as first_month
  from (
    select user_id, month from budget_months
    union all
    select user_id, cashflow_start_ym as month
    from user_finance_profile
    where cashflow_start_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ) src
  group by user_id
),
months as (
  select f.user_id, to_char(gs, 'YYYY-MM') as month
  from firsts f
  cross join cur
  cross join lateral generate_series(
    to_date(f.first_month || '-01', 'YYYY-MM-DD'),
    to_date(cur.ym || '-01', 'YYYY-MM-DD') - interval '1 month',
    interval '1 month'
  ) gs
)
insert into monthly_computed_lines (user_id, month, insurance, ilp, debt)
select
  m.user_id,
  m.month,
  round(coalesce((select sum(ip.monthly_premium) from insurance_policies ip where ip.user_id = m.user_id), 0), 2),
  round(coalesce((select sum(lp.monthly_premium) from ilp_policies lp where lp.user_id = m.user_id), 0), 2),
  round(
    coalesce((select sum(l.monthly) from loans l where l.user_id = m.user_id and l.end_ym >= m.month), 0)
    + coalesce((
        select sum(o.monthly) from other_loans o
        where o.user_id = m.user_id and o.loan_type = 'personal' and o.paid_at is null
      ), 0),
    2
  )
from months m
on conflict (user_id, month) do nothing;
