-- 074: Atomic CPF contribution / transaction logging (DATA-003) + idempotency.
--
-- lib/cpf/contributions.ts and lib/cpf/transactions.ts used to insert/update/
-- delete the log row, then load the profile and save OA/SA/MA back — separate
-- calls, so a failure in between left the log and the balances disagreeing,
-- and two concurrent saves could lose one update.
--
-- Each operation is now one transaction. BEHAVIOUR IS UNCHANGED, including
-- the existing floor at 0 (greatest(0, …)) on deletes, edits and OA debits —
-- so, as before, add-then-delete may not return to the starting balance if
-- the floor kicked in. The audit log records when that happens
-- (details.clamped = true) so the effect is visible.
--
-- SECURITY INVOKER (RLS applies). Requires 069 and 070. Idempotent.

alter table public.cpf_contributions add column if not exists client_request_id text;
alter table public.cpf_transactions add column if not exists client_request_id text;

do $$ begin
  alter table public.cpf_contributions
    add constraint cpf_contributions_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.cpf_transactions
    add constraint cpf_transactions_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create unique index if not exists cpf_contributions_user_client_request_idx
  on public.cpf_contributions (user_id, client_request_id)
  where client_request_id is not null;
create unique index if not exists cpf_transactions_user_client_request_idx
  on public.cpf_transactions (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- Moves OA/SA/MA by the given deltas under the profile row lock and returns
-- {"oa","sa","ma"}. p_floor_zero applies greatest(0, …) like the old code.
-- All-zero deltas write nothing (as before) and return the current values.
-- A missing profile row is created the way saveFinanceProfile did
-- (salary_credit_day 0, cashflow_start_ym = current SGT month).
create or replace function private.cpf_profile_apply(
  p_user_id uuid,
  p_operation text,
  p_d_oa numeric,
  p_d_sa numeric,
  p_d_ma numeric,
  p_floor_zero boolean,
  p_key text,
  p_details jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_before user_finance_profile%rowtype;
  v_after user_finance_profile%rowtype;
begin
  if coalesce(p_d_oa, 0) = 0 and coalesce(p_d_sa, 0) = 0 and coalesce(p_d_ma, 0) = 0 then
    select * into v_after from user_finance_profile where user_id = p_user_id;
    return jsonb_build_object(
      'oa', coalesce(v_after.oa, 0), 'sa', coalesce(v_after.sa, 0), 'ma', coalesce(v_after.ma, 0));
  end if;

  insert into user_finance_profile (user_id, salary_credit_day, cashflow_start_ym)
    values (p_user_id, 0, to_char(now() at time zone 'Asia/Singapore', 'YYYY-MM'))
    on conflict (user_id) do nothing;

  select * into v_before from user_finance_profile where user_id = p_user_id for update;
  if not found then
    raise exception 'Forbidden';
  end if;

  update user_finance_profile
    set oa = case when p_floor_zero then greatest(0, oa + coalesce(p_d_oa, 0)) else oa + coalesce(p_d_oa, 0) end,
        sa = case when p_floor_zero then greatest(0, sa + coalesce(p_d_sa, 0)) else sa + coalesce(p_d_sa, 0) end,
        ma = case when p_floor_zero then greatest(0, ma + coalesce(p_d_ma, 0)) else ma + coalesce(p_d_ma, 0) end,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_after;

  if coalesce(p_d_oa, 0) <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_oa', p_user_id,
      v_after.oa - v_before.oa, v_after.oa, p_key,
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
        'requested_delta', p_d_oa, 'clamped', (v_after.oa - v_before.oa) <> p_d_oa));
  end if;
  if coalesce(p_d_sa, 0) <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_sa', p_user_id,
      v_after.sa - v_before.sa, v_after.sa, p_key,
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
        'requested_delta', p_d_sa, 'clamped', (v_after.sa - v_before.sa) <> p_d_sa));
  end if;
  if coalesce(p_d_ma, 0) <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_ma', p_user_id,
      v_after.ma - v_before.ma, v_after.ma, p_key,
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object(
        'requested_delta', p_d_ma, 'clamped', (v_after.ma - v_before.ma) <> p_d_ma));
  end if;

  return jsonb_build_object('oa', v_after.oa, 'sa', v_after.sa, 'ma', v_after.ma);
end;
$$;

revoke all on function private.cpf_profile_apply(uuid, text, numeric, numeric, numeric, boolean, text, jsonb) from public;
grant execute on function private.cpf_profile_apply(uuid, text, numeric, numeric, numeric, boolean, text, jsonb) to authenticated, service_role;

-- OA effect of a CPF transaction row (mirrors cpfTxnOaDelta in lib/cpf/types.ts).
create or replace function private.cpf_txn_oa_delta(p_direction text, p_funding_source text, p_amount numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_funding_source <> 'cpf_oa' then 0
    when p_direction = 'credit' then p_amount
    else -p_amount
  end;
$$;

revoke all on function private.cpf_txn_oa_delta(text, text, numeric) from public;
grant execute on function private.cpf_txn_oa_delta(text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Contributions
create or replace function public.cpf_add_contribution(
  p_user_id uuid,
  p_month date,
  p_oa numeric,
  p_sa numeric,
  p_ma numeric,
  p_note text default '',
  p_credited_on date default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row cpf_contributions%rowtype;
  v_profile jsonb;
begin
  perform private.ledger_assert_caller(p_user_id);
  if p_oa < 0 or p_sa < 0 or p_ma < 0 then
    raise exception 'OA, SA, and MA must be non-negative numbers';
  end if;
  if p_oa = 0 and p_sa = 0 and p_ma = 0 then
    raise exception 'Enter at least one non-zero contribution amount';
  end if;

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('cpf_contributions', p_user_id, p_client_request_id);
    select * into v_row from cpf_contributions
      where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      v_profile := private.cpf_profile_apply(p_user_id, 'cpf.contribution.add', 0, 0, 0, false, null, null);
      return jsonb_build_object('contribution', to_jsonb(v_row), 'profile', v_profile, 'replayed', true);
    end if;
  end if;

  -- (user_id, month) is unique: a second log for the month raises 23505.
  insert into cpf_contributions (user_id, month, oa, sa, ma, note, credited_on, client_request_id)
    values (p_user_id, p_month, p_oa, p_sa, p_ma, coalesce(p_note, ''), p_credited_on, p_client_request_id)
    returning * into v_row;

  v_profile := private.cpf_profile_apply(p_user_id, 'cpf.contribution.add', p_oa, p_sa, p_ma, false,
    p_client_request_id, jsonb_build_object('contribution_id', v_row.id));

  return jsonb_build_object('contribution', to_jsonb(v_row), 'profile', v_profile, 'replayed', false);
end;
$$;

create or replace function public.cpf_delete_contribution(
  p_user_id uuid,
  p_contribution_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row cpf_contributions%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  delete from cpf_contributions
    where id = p_contribution_id and user_id = p_user_id
    returning * into v_row;
  if not found then
    raise exception 'Contribution not found';
  end if;
  return private.cpf_profile_apply(p_user_id, 'cpf.contribution.delete', -v_row.oa, -v_row.sa, -v_row.ma, true,
    null, jsonb_build_object('contribution_id', v_row.id));
end;
$$;

create or replace function public.cpf_update_contribution(
  p_user_id uuid,
  p_contribution_id uuid,
  p_month date,
  p_oa numeric,
  p_sa numeric,
  p_ma numeric,
  p_note text default '',
  p_credited_on date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old cpf_contributions%rowtype;
  v_new cpf_contributions%rowtype;
  v_profile jsonb;
begin
  perform private.ledger_assert_caller(p_user_id);
  if p_oa < 0 or p_sa < 0 or p_ma < 0 then
    raise exception 'OA, SA, and MA must be non-negative numbers';
  end if;
  if p_oa = 0 and p_sa = 0 and p_ma = 0 then
    raise exception 'Enter at least one non-zero contribution amount';
  end if;

  select * into v_old from cpf_contributions
    where id = p_contribution_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'Contribution not found';
  end if;

  update cpf_contributions
    set month = p_month, oa = p_oa, sa = p_sa, ma = p_ma,
        note = coalesce(p_note, ''), credited_on = p_credited_on
    where id = p_contribution_id and user_id = p_user_id
    returning * into v_new;

  v_profile := private.cpf_profile_apply(p_user_id, 'cpf.contribution.update',
    p_oa - v_old.oa, p_sa - v_old.sa, p_ma - v_old.ma, true,
    null, jsonb_build_object('contribution_id', v_new.id));

  return jsonb_build_object('contribution', to_jsonb(v_new), 'profile', v_profile);
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions (fields arrive already normalised by normalizeCpfTransactionInput)
create or replace function public.cpf_add_transaction(
  p_user_id uuid,
  p_txn_date date,
  p_direction text,
  p_funding_source text,
  p_amount numeric,
  p_category text,
  p_bto_stage text default null,
  p_note text default '',
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row cpf_transactions%rowtype;
  v_profile jsonb;
begin
  perform private.ledger_assert_caller(p_user_id);

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('cpf_transactions', p_user_id, p_client_request_id);
    select * into v_row from cpf_transactions
      where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      v_profile := private.cpf_profile_apply(p_user_id, 'cpf.transaction.add', 0, 0, 0, false, null, null);
      return jsonb_build_object('transaction', to_jsonb(v_row), 'oa', v_profile -> 'oa', 'replayed', true);
    end if;
  end if;

  insert into cpf_transactions (
    user_id, txn_date, direction, funding_source, amount, category, bto_stage, note, client_request_id
  ) values (
    p_user_id, p_txn_date, p_direction, p_funding_source, p_amount, p_category, p_bto_stage,
    coalesce(p_note, ''), p_client_request_id
  )
  returning * into v_row;

  v_profile := private.cpf_profile_apply(p_user_id, 'cpf.transaction.add',
    private.cpf_txn_oa_delta(v_row.direction, v_row.funding_source, v_row.amount), 0, 0, true,
    p_client_request_id, jsonb_build_object('transaction_id', v_row.id));

  return jsonb_build_object('transaction', to_jsonb(v_row), 'oa', v_profile -> 'oa', 'replayed', false);
end;
$$;

create or replace function public.cpf_delete_transaction(
  p_user_id uuid,
  p_transaction_id uuid
)
returns numeric
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_row cpf_transactions%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  delete from cpf_transactions
    where id = p_transaction_id and user_id = p_user_id
    returning * into v_row;
  if not found then
    raise exception 'Transaction not found';
  end if;
  return (private.cpf_profile_apply(p_user_id, 'cpf.transaction.delete',
    -private.cpf_txn_oa_delta(v_row.direction, v_row.funding_source, v_row.amount), 0, 0, true,
    null, jsonb_build_object('transaction_id', v_row.id)) ->> 'oa')::numeric;
end;
$$;

create or replace function public.cpf_update_transaction(
  p_user_id uuid,
  p_transaction_id uuid,
  p_txn_date date,
  p_direction text,
  p_funding_source text,
  p_amount numeric,
  p_category text,
  p_bto_stage text default null,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old cpf_transactions%rowtype;
  v_new cpf_transactions%rowtype;
  v_profile jsonb;
begin
  perform private.ledger_assert_caller(p_user_id);
  select * into v_old from cpf_transactions
    where id = p_transaction_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'Transaction not found';
  end if;

  update cpf_transactions
    set txn_date = p_txn_date, direction = p_direction, funding_source = p_funding_source,
        amount = p_amount, category = p_category, bto_stage = p_bto_stage, note = coalesce(p_note, '')
    where id = p_transaction_id and user_id = p_user_id
    returning * into v_new;

  v_profile := private.cpf_profile_apply(p_user_id, 'cpf.transaction.update',
    private.cpf_txn_oa_delta(v_new.direction, v_new.funding_source, v_new.amount)
      - private.cpf_txn_oa_delta(v_old.direction, v_old.funding_source, v_old.amount),
    0, 0, true, null, jsonb_build_object('transaction_id', v_new.id));

  return jsonb_build_object('transaction', to_jsonb(v_new), 'oa', v_profile -> 'oa');
end;
$$;

revoke all on function public.cpf_add_contribution(uuid, date, numeric, numeric, numeric, text, date, text) from public, anon;
revoke all on function public.cpf_delete_contribution(uuid, uuid) from public, anon;
revoke all on function public.cpf_update_contribution(uuid, uuid, date, numeric, numeric, numeric, text, date) from public, anon;
revoke all on function public.cpf_add_transaction(uuid, date, text, text, numeric, text, text, text, text) from public, anon;
revoke all on function public.cpf_delete_transaction(uuid, uuid) from public, anon;
revoke all on function public.cpf_update_transaction(uuid, uuid, date, text, text, numeric, text, text, text) from public, anon;
grant execute on function public.cpf_add_contribution(uuid, date, numeric, numeric, numeric, text, date, text) to authenticated, service_role;
grant execute on function public.cpf_delete_contribution(uuid, uuid) to authenticated, service_role;
grant execute on function public.cpf_update_contribution(uuid, uuid, date, numeric, numeric, numeric, text, date) to authenticated, service_role;
grant execute on function public.cpf_add_transaction(uuid, date, text, text, numeric, text, text, text, text) to authenticated, service_role;
grant execute on function public.cpf_delete_transaction(uuid, uuid) to authenticated, service_role;
grant execute on function public.cpf_update_transaction(uuid, uuid, date, text, text, numeric, text, text, text) to authenticated, service_role;
