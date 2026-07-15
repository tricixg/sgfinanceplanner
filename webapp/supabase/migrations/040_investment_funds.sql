-- Investment funds (deposit/withdraw + payout ledger for the Investment tab)
-- Run after 039_password_auth_note.sql

create table if not exists investment_funds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  balance numeric not null default 0,
  notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists investment_funds_user_idx
  on investment_funds (user_id, sort_order);

create table if not exists fund_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fund_id uuid not null references investment_funds (id) on delete cascade,
  goal_id uuid references savings_goals (id) on delete set null,
  kind text not null check (kind in ('deposit', 'withdrawal', 'payout')),
  amount numeric not null,
  balance_after numeric,
  note text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint fund_transactions_amount_nonzero check (amount <> 0)
);

create index if not exists fund_transactions_fund_occurred_idx
  on fund_transactions (fund_id, occurred_at desc);

create index if not exists fund_transactions_goal_idx
  on fund_transactions (goal_id, occurred_at desc)
  where goal_id is not null;

alter table investment_funds enable row level security;

create policy "Users manage own funds"
  on investment_funds for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table fund_transactions enable row level security;

create policy "Users manage own fund transactions"
  on fund_transactions for all
  using (
    user_id = auth.uid()
    and exists (
      select 1 from investment_funds f
      where f.id = fund_id and f.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from investment_funds f
      where f.id = fund_id and f.user_id = auth.uid()
    )
  );

-- Goal linking parity with linked_account_id / linked_pool_id
alter table savings_goals
  add column if not exists linked_fund_id uuid references investment_funds (id) on delete set null;
