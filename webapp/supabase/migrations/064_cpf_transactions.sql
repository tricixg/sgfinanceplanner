-- CPF OA transaction log: withdrawals (BTO downpayment, BSD, legal fee,
-- mortgage, other) and credits (housing grants, refunds, other). Rows tagged
-- with a bto_stage also feed the BTO planner's payment reconciliation, which
-- is why cash-paid BTO bills (option fee, cash top-ups) live here too.
--
-- Logging a cpf_oa row adjusts user_finance_profile.oa (debit subtracts,
-- credit adds; delete reverses — see lib/cpf/transactions.ts). Cash rows never
-- touch the CPF balance. Monthly contributions stay in cpf_contributions.

create table if not exists cpf_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  txn_date date not null,
  direction text not null check (direction in ('debit', 'credit')),
  funding_source text not null default 'cpf_oa' check (funding_source in ('cpf_oa', 'cash')),
  amount numeric(14, 2) not null check (amount > 0),
  category text not null check (category in (
    'bto_option_fee', 'bto_downpayment', 'bto_bsd', 'bto_legal_fee',
    'bto_loan_shortfall', 'bto_mortgage', 'housing_grant',
    'refund', 'other_withdrawal', 'other_credit'
  )),
  bto_stage text check (bto_stage in ('booking', 'afl', 'keys', 'mortgage')),
  note text not null default '',
  created_at timestamptz not null default now(),
  -- Cash is only tracked for BTO bills; a cash row must be a BTO debit.
  constraint cpf_transactions_cash_is_bto_debit check (
    funding_source = 'cpf_oa' or (bto_stage is not null and direction = 'debit')
  )
);

create index if not exists cpf_transactions_user_date_idx
  on cpf_transactions (user_id, txn_date desc);

alter table cpf_transactions enable row level security;

create policy "Users manage own cpf transactions"
  on cpf_transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
