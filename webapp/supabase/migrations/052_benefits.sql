-- User-defined work/insurance benefits (dental, specialist medical, WFH
-- allowance, etc.) with utilization tracking. Benefits are a table the user
-- maintains themselves — nothing is hardcoded. Each benefit has a limit and
-- either resets on a recurring cycle (cycle_months set, e.g. 12 for annual)
-- or never resets (cycle_months null, e.g. a one-time WFH allowance).
-- benefit_claims is the usage ledger; a claim can optionally link back to the
-- reimbursement ledger row (savings_transactions/budget_transactions) that
-- created it, so deleting that row reverses the usage.
-- Superseded by 053_benefits_cycle_dates.sql (cycle_months/cycle_anchor_date
-- → explicit cycle_start_date/cycle_end_date; limit_amount made nullable).
-- Kept as-is so this matches what was actually run against the database —
-- do not edit; make schema changes in a new migration instead.
-- Run after 051_transport_medical_claims.sql

create table if not exists benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  limit_amount numeric(12, 2) not null default 0,
  cycle_months int,
  cycle_anchor_date date not null default current_date,
  income_category_id uuid references income_categories (id) on delete set null,
  notes text not null default '',
  sort_order int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists benefits_user_sort_idx
  on benefits (user_id, sort_order);

alter table benefits enable row level security;

create policy "Users manage own benefits"
  on benefits for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists benefit_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  benefit_id uuid not null references benefits (id) on delete cascade,
  amount numeric(12, 2) not null,
  claimed_at date not null default current_date,
  note text not null default '',
  source_record_type text,
  source_record_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists benefit_claims_benefit_idx
  on benefit_claims (benefit_id, claimed_at);

create index if not exists benefit_claims_source_idx
  on benefit_claims (source_record_type, source_record_id)
  where source_record_type is not null;

alter table benefit_claims enable row level security;

create policy "Users manage own benefit claims"
  on benefit_claims for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
