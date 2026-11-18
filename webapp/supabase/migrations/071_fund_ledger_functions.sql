-- 071: Atomic investment-fund ledger operations (DATA-003) + idempotency key.
--
-- Replaces the read-modify-write in lib/funds/ledger.ts (fund balance, goal
-- saved_amount and fund_transactions row in separate calls, with best-effort
-- manual reverts) with one transaction per operation.
--
-- SECURITY INVOKER (RLS applies). Requires 069 and 070. Idempotent.

alter table public.fund_transactions
  add column if not exists client_request_id text;

do $$ begin
  alter table public.fund_transactions
    add constraint fund_transactions_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create unique index if not exists fund_transactions_user_client_request_idx
  on public.fund_transactions (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
create or replace function public.ledger_apply_fund_transaction(
  p_user_id uuid,
  p_fund_id uuid,
  p_amount numeric,
  p_kind text default null,
  p_occurred_at timestamptz default null,
  p_note text default '',
  p_goal_id uuid default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(14,2) := round(p_amount, 2);
  v_kind text;
  v_owner uuid;
  v_balance numeric(14,2);
  v_saved numeric(14,2);
  v_goal savings_goals%rowtype;
  v_goal_name text;
  v_row fund_transactions%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_amount is null or v_amount = 0 then
    raise exception 'Transaction amount must be non-zero';
  end if;
  v_kind := coalesce(p_kind, case when v_amount > 0 then 'deposit' else 'withdrawal' end);

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('fund_transactions', p_user_id, p_client_request_id);
    select * into v_row from fund_transactions
      where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      select nullif(name, '') into v_goal_name from savings_goals where id = v_row.goal_id;
      return jsonb_build_object('transaction', to_jsonb(v_row), 'goal_name', v_goal_name, 'replayed', true);
    end if;
  end if;

  update investment_funds
    set balance = balance + v_amount, updated_at = now()
    where id = p_fund_id
    returning user_id, balance into v_owner, v_balance;
  if not found then
    raise exception 'Fund not found';
  end if;
  if v_owner <> p_user_id then
    raise exception 'Forbidden';
  end if;
  if v_balance < 0 then
    raise exception 'Insufficient balance';
  end if;
  perform private.ledger_audit_append(p_user_id, 'fund.apply', 'investment_fund', p_fund_id,
    v_amount, v_balance, p_client_request_id, jsonb_build_object('kind', v_kind));

  if p_goal_id is not null then
    select * into v_goal from savings_goals where id = p_goal_id for update;
    if not found then
      raise exception 'Goal not found';
    end if;
    if v_goal.scope <> 'individual' or v_goal.owner_user_id is distinct from p_user_id then
      raise exception 'Choose a personal savings goal';
    end if;
    update savings_goals
      set saved_amount = greatest(0, saved_amount + v_amount), updated_at = now()
      where id = p_goal_id
      returning saved_amount into v_saved;
    v_goal_name := nullif(v_goal.name, '');
    perform private.ledger_audit_append(p_user_id, 'fund.apply', 'savings_goal', p_goal_id,
      v_amount, v_saved, p_client_request_id, '{}'::jsonb);
  end if;

  insert into fund_transactions (
    user_id, fund_id, goal_id, kind, amount, balance_after, note, occurred_at, client_request_id
  ) values (
    p_user_id, p_fund_id, p_goal_id, v_kind, v_amount, v_balance, coalesce(p_note, ''),
    coalesce(p_occurred_at, now()), p_client_request_id
  )
  returning * into v_row;

  return jsonb_build_object('transaction', to_jsonb(v_row), 'goal_name', v_goal_name, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.ledger_delete_fund_transaction(
  p_user_id uuid,
  p_fund_id uuid,
  p_transaction_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tx fund_transactions%rowtype;
  v_reverse numeric(14,2);
  v_balance numeric(14,2);
  v_saved numeric(14,2);
begin
  perform private.ledger_assert_caller(p_user_id);
  select * into v_tx from fund_transactions
    where id = p_transaction_id and fund_id = p_fund_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'Transaction not found';
  end if;

  v_reverse := -v_tx.amount;

  update investment_funds
    set balance = balance + v_reverse, updated_at = now()
    where id = p_fund_id
    returning balance into v_balance;
  if not found then
    raise exception 'Fund not found';
  end if;
  if v_balance < 0 then
    raise exception 'Insufficient balance';
  end if;
  perform private.ledger_audit_append(p_user_id, 'fund.delete', 'investment_fund', p_fund_id,
    v_reverse, v_balance, null, jsonb_build_object('transaction_id', v_tx.id));

  if v_tx.goal_id is not null then
    update savings_goals
      set saved_amount = greatest(0, saved_amount + v_reverse), updated_at = now()
      where id = v_tx.goal_id
      returning saved_amount into v_saved;
    if not found then
      raise exception 'Goal not found';
    end if;
    perform private.ledger_audit_append(p_user_id, 'fund.delete', 'savings_goal', v_tx.goal_id,
      v_reverse, v_saved, null, jsonb_build_object('transaction_id', v_tx.id));
  end if;

  delete from fund_transactions where id = v_tx.id;
end;
$$;

revoke all on function public.ledger_apply_fund_transaction(uuid, uuid, numeric, text, timestamptz, text, uuid, text) from public, anon;
revoke all on function public.ledger_delete_fund_transaction(uuid, uuid, uuid) from public, anon;
grant execute on function public.ledger_apply_fund_transaction(uuid, uuid, numeric, text, timestamptz, text, uuid, text) to authenticated, service_role;
grant execute on function public.ledger_delete_fund_transaction(uuid, uuid, uuid) to authenticated, service_role;
