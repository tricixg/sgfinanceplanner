-- Shared BTO planner scenario (project name, flat price, grants, loan terms,
-- timeline) — one row per household so both linked partners see and edit the
-- same numbers. Person-specific fields (own salary, own CPF growth mode)
-- stay in each user's user_finance_profile.bto_planner.

create table if not exists household_bto_planner (
  household_id uuid primary key references households (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table household_bto_planner enable row level security;

create policy "Household members manage shared BTO planner"
  on household_bto_planner for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));


