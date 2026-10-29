-- On-call tracker: log on-call stretches (start/end date, daily rate) and
-- record the payslip payments that cover them. A payment can cover part of a
-- stretch (e.g. 3 of 5 days) with the rest paid on a later payslip, so
-- payments link to stretches through oncall_payment_items (days per stretch).
-- A payment normally creates an income deposit (savings_transactions) tagged
-- with the new "On-call allowance" income category; deposited = false marks a
-- payment for pay already recorded in income before the tracker existed.
-- Run after 059_other_loans_bt_principal.sql

create table if not exists oncall_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  daily_rate numeric(12, 2) not null default 0,
  cpf_age_band text not null default '55',
  employee_cpf_rate numeric(5, 2) not null default 20,
  employer_cpf_rate numeric(5, 2) not null default 17,
  cpf_applies boolean not null default true,
  default_account_id uuid references user_savings_accounts (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table oncall_settings enable row level security;

create policy "Users manage own on-call settings"
  on oncall_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists oncall_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  daily_rate numeric(12, 2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oncall_entries_dates_check check (end_date >= start_date)
);

create index if not exists oncall_entries_user_start_idx
  on oncall_entries (user_id, start_date desc);

alter table oncall_entries enable row level security;

create policy "Users manage own on-call entries"
  on oncall_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists oncall_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  received_on date not null,
  -- First day of the salary month the payslip is for.
  salary_month date not null,
  amount numeric(12, 2) not null default 0,
  deposited boolean not null default true,
  account_id uuid references user_savings_accounts (id) on delete set null,
  income_category_id uuid references income_categories (id) on delete set null,
  savings_transaction_id uuid references savings_transactions (id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists oncall_payments_user_month_idx
  on oncall_payments (user_id, salary_month desc);

alter table oncall_payments enable row level security;

create policy "Users manage own on-call payments"
  on oncall_payments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists oncall_payment_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  payment_id uuid not null references oncall_payments (id) on delete cascade,
  -- Restrict: a stretch with paid days can't be deleted until its payments are.
  entry_id uuid not null references oncall_entries (id) on delete restrict,
  days int not null,
  constraint oncall_payment_items_days_check check (days > 0)
);

create index if not exists oncall_payment_items_payment_idx
  on oncall_payment_items (payment_id);

create index if not exists oncall_payment_items_entry_idx
  on oncall_payment_items (entry_id);

alter table oncall_payment_items enable row level security;

create policy "Users manage own on-call payment items"
  on oncall_payment_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- "On-call allowance" income category: additive cashflow like Poker/Others,
-- not baseline, since on-call pay varies month to month.
insert into income_categories (user_id, name, slug, sort_order, counts_in_baseline, counts_as_additive)
select distinct ic.user_id, 'On-call allowance', 'oncall', 7, false, true
from income_categories ic
where not exists (
  select 1 from income_categories x
  where x.user_id = ic.user_id and x.slug = 'oncall'
);
