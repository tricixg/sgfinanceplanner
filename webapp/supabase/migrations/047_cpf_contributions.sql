-- Monthly CPF contribution log (OA/SA/MA split). Insert-only per month —
-- logging a contribution also increments user_finance_profile.oa/sa/ma
-- (see lib/cpf/contributions.ts); corrections are done by deleting the row
-- (which reverses the balance) and re-adding it, not editing in place.

create table if not exists cpf_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  oa numeric not null default 0,
  sa numeric not null default 0,
  ma numeric not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, month)
);

create index if not exists cpf_contributions_user_month_idx
  on cpf_contributions (user_id, month desc);

alter table cpf_contributions enable row level security;

create policy "Users manage own cpf contributions"
  on cpf_contributions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
