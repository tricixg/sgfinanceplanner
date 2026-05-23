-- Personal account flags, savings transaction ledger (deposits / withdrawals)
-- Run after 003_couples_and_ledger.sql

alter table user_savings_accounts
  add column if not exists include_in_savings boolean not null default true;

alter table savings_pools
  add column if not exists include_in_savings boolean not null default true;

create table if not exists savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete cascade,
  account_id uuid references user_savings_accounts (id) on delete cascade,
  pool_id uuid references savings_pools (id) on delete cascade,
  goal_id uuid references savings_goals (id) on delete set null,
  kind text not null check (kind in ('deposit', 'withdrawal', 'adjustment')),
  amount numeric not null,
  balance_after numeric,
  note text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint savings_transactions_one_target check (
    (account_id is not null and pool_id is null)
    or (pool_id is not null and account_id is null)
  ),
  constraint savings_transactions_amount_nonzero check (amount <> 0)
);

create index if not exists savings_transactions_account_occurred_idx
  on savings_transactions (account_id, occurred_at desc)
  where account_id is not null;

create index if not exists savings_transactions_pool_occurred_idx
  on savings_transactions (pool_id, occurred_at desc)
  where pool_id is not null;

create index if not exists savings_transactions_goal_idx
  on savings_transactions (goal_id, occurred_at desc)
  where goal_id is not null;

alter table savings_transactions enable row level security;

-- Personal account transactions: owner only
create policy "Users manage own account transactions"
  on savings_transactions for all
  using (
    account_id is not null
    and exists (
      select 1 from user_savings_accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  )
  with check (
    account_id is not null
    and user_id = auth.uid()
    and exists (
      select 1 from user_savings_accounts a
      where a.id = account_id and a.user_id = auth.uid()
    )
  );

-- Joint pool transactions: household members
create policy "Household manages pool transactions"
  on savings_transactions for all
  using (
    pool_id is not null
    and household_id is not null
    and public.is_household_member(household_id)
  )
  with check (
    pool_id is not null
    and user_id = auth.uid()
    and household_id is not null
    and public.is_household_member(household_id)
  );
