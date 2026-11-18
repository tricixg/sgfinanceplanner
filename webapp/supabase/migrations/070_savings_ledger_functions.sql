-- 070: Atomic savings ledger operations (DATA-003) + idempotency key.
--
-- Each function does in ONE transaction what lib/savings/ledger.ts and
-- lib/expenses/ledger-sync.ts used to do in several PostgREST calls:
--   * ledger_apply_savings_transaction  — move an account/pool balance (and a
--     goal's saved_amount), insert the savings_transactions row
--   * ledger_delete_savings_transaction — reverse those moves, delete the row
--   * ledger_reverse_expense            — undo an expense's cash withdrawal(s)
--     and card ledger row before the expense is deleted
-- Balances use `balance = balance + delta` under the row lock, so concurrent
-- calls cannot lose updates. Any error rolls back everything.
--
-- SECURITY INVOKER: they run as the calling user, so RLS still decides which
-- accounts, pools, goals and ledger rows the caller can touch. Ownership
-- checks are repeated explicitly because the Telegram bot calls with the
-- service role (RLS bypassed).
--
-- Requires 069. Idempotent: safe to run more than once.

alter table public.savings_transactions
  add column if not exists client_request_id text;

do $$ begin
  alter table public.savings_transactions
    add constraint savings_transactions_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create unique index if not exists savings_transactions_user_client_request_idx
  on public.savings_transactions (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- Serialises calls that share an idempotency key (per user + scope) until the
-- first one commits, so the second sees its row and returns it.
create or replace function private.ledger_idempotency_lock(p_scope text, p_user_id uuid, p_key text)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_scope || ':' || p_user_id::text || ':' || p_key, 0)
  );
$$;

revoke all on function private.ledger_idempotency_lock(text, uuid, text) from public;
grant execute on function private.ledger_idempotency_lock(text, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A signed-in caller may only act as themselves. (Service-role callers such as
-- the Telegram bot have no auth.uid() and pass the linked user's id.)
create or replace function private.ledger_assert_caller(p_user_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_user_id is null or (auth.uid() is not null and auth.uid() <> p_user_id) then
    raise exception 'Forbidden';
  end if;
end;
$$;

revoke all on function private.ledger_assert_caller(uuid) from public;
grant execute on function private.ledger_assert_caller(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
create or replace function public.ledger_apply_savings_transaction(
  p_user_id uuid,
  p_amount numeric,
  p_kind text default null,
  p_occurred_at timestamptz default null,
  p_note text default '',
  p_goal_id uuid default null,
  p_account_id uuid default null,
  p_pool_id uuid default null,
  p_household_id uuid default null,
  p_expense_id uuid default null,
  p_income_category_id uuid default null,
  p_exclude_from_budget boolean default false,
  p_source_record_type text default null,
  p_source_record_id uuid default null,
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
  v_household uuid;
  v_balance numeric(14,2);
  v_saved numeric(14,2);
  v_goal savings_goals%rowtype;
  v_goal_name text;
  v_row savings_transactions%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_amount is null or v_amount = 0 then
    raise exception 'Transaction amount must be non-zero';
  end if;
  if (p_account_id is null) = (p_pool_id is null) then
    raise exception 'Specify exactly one of accountId or poolId';
  end if;
  v_kind := coalesce(p_kind, case when v_amount > 0 then 'deposit' else 'withdrawal' end);

  -- Idempotent replay: same key from the same user returns the first result.
  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('savings_transactions', p_user_id, p_client_request_id);
    select * into v_row from savings_transactions
      where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      select nullif(name, '') into v_goal_name from savings_goals where id = v_row.goal_id;
      return jsonb_build_object('transaction', to_jsonb(v_row), 'goal_name', v_goal_name, 'replayed', true);
    end if;
  end if;

  if p_account_id is not null then
    update user_savings_accounts
      set balance = balance + v_amount, updated_at = now()
      where id = p_account_id
      returning user_id, balance into v_owner, v_balance;
    if not found then
      raise exception 'Account not found';
    end if;
    if v_owner <> p_user_id then
      raise exception 'Forbidden';
    end if;
    if v_balance < 0 then
      raise exception 'Insufficient balance';
    end if;
    perform private.ledger_audit_append(p_user_id, 'savings.apply', 'savings_account', p_account_id,
      v_amount, v_balance, p_client_request_id, jsonb_build_object('kind', v_kind, 'expense_id', p_expense_id));
  else
    if p_household_id is null then
      raise exception 'householdId required for pool transactions';
    end if;
    update savings_pools
      set balance = balance + v_amount, updated_at = now()
      where id = p_pool_id
      returning household_id, balance into v_household, v_balance;
    if not found then
      raise exception 'Pool not found';
    end if;
    if v_household <> p_household_id then
      raise exception 'Pool not in household';
    end if;
    if v_balance < 0 then
      raise exception 'Insufficient balance';
    end if;
    perform private.ledger_audit_append(p_user_id, 'savings.apply', 'savings_pool', p_pool_id,
      v_amount, v_balance, p_client_request_id, jsonb_build_object('kind', v_kind));
  end if;

  if p_goal_id is not null then
    select * into v_goal from savings_goals where id = p_goal_id for update;
    if not found then
      raise exception 'Goal not found';
    end if;
    if p_account_id is not null then
      if v_goal.scope <> 'individual' or v_goal.owner_user_id is distinct from p_user_id then
        raise exception 'Choose a personal savings goal';
      end if;
    else
      if v_goal.scope <> 'shared' or v_goal.household_id is distinct from p_household_id then
        raise exception 'Choose a shared savings goal';
      end if;
    end if;
    -- Same floor at 0 as before (Math.max(0, saved + amount)).
    update savings_goals
      set saved_amount = greatest(0, saved_amount + v_amount), updated_at = now()
      where id = p_goal_id
      returning saved_amount into v_saved;
    v_goal_name := nullif(v_goal.name, '');
    perform private.ledger_audit_append(p_user_id, 'savings.apply', 'savings_goal', p_goal_id,
      v_amount, v_saved, p_client_request_id, '{}'::jsonb);
  end if;

  insert into savings_transactions (
    user_id, household_id, account_id, pool_id, goal_id, kind, amount, balance_after,
    note, occurred_at, expense_id, income_category_id, exclude_from_budget,
    source_record_type, source_record_id, client_request_id
  ) values (
    p_user_id, p_household_id, p_account_id, p_pool_id, p_goal_id, v_kind, v_amount, v_balance,
    coalesce(p_note, ''), coalesce(p_occurred_at, now()), p_expense_id, p_income_category_id,
    coalesce(p_exclude_from_budget, false), p_source_record_type, p_source_record_id, p_client_request_id
  )
  returning * into v_row;

  return jsonb_build_object('transaction', to_jsonb(v_row), 'goal_name', v_goal_name, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns false when the row doesn't exist (or isn't visible to the caller).
create or replace function public.ledger_delete_savings_transaction(
  p_user_id uuid,
  p_transaction_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tx savings_transactions%rowtype;
  v_reverse numeric(14,2);
  v_balance numeric(14,2);
  v_saved numeric(14,2);
begin
  perform private.ledger_assert_caller(p_user_id);
  -- Row lock: a concurrent delete of the same row waits, then finds nothing.
  select * into v_tx from savings_transactions
    where user_id = p_user_id and id = p_transaction_id
    for update;
  if not found then
    return false;
  end if;

  v_reverse := -v_tx.amount;

  if v_tx.account_id is not null then
    update user_savings_accounts
      set balance = balance + v_reverse, updated_at = now()
      where id = v_tx.account_id
      returning balance into v_balance;
    if not found then
      raise exception 'Account not found';
    end if;
    if v_balance < 0 then
      raise exception 'Insufficient balance';
    end if;
    perform private.ledger_audit_append(p_user_id, 'savings.delete', 'savings_account', v_tx.account_id,
      v_reverse, v_balance, null, jsonb_build_object('transaction_id', v_tx.id));
  elsif v_tx.pool_id is not null then
    update savings_pools
      set balance = balance + v_reverse, updated_at = now()
      where id = v_tx.pool_id
      returning balance into v_balance;
    if not found then
      raise exception 'Pool not found';
    end if;
    if v_balance < 0 then
      raise exception 'Insufficient balance';
    end if;
    perform private.ledger_audit_append(p_user_id, 'savings.delete', 'savings_pool', v_tx.pool_id,
      v_reverse, v_balance, null, jsonb_build_object('transaction_id', v_tx.id));
  end if;

  if v_tx.goal_id is not null then
    update savings_goals
      set saved_amount = greatest(0, saved_amount + v_reverse), updated_at = now()
      where id = v_tx.goal_id
      returning saved_amount into v_saved;
    if not found then
      raise exception 'Goal not found';
    end if;
    perform private.ledger_audit_append(p_user_id, 'savings.delete', 'savings_goal', v_tx.goal_id,
      v_reverse, v_saved, null, jsonb_build_object('transaction_id', v_tx.id));
  end if;

  delete from savings_transactions where id = v_tx.id and user_id = p_user_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo an expense's ledger effects (call before deleting the expense):
-- restore each linked cash withdrawal, remove the linked savings rows
-- (including record-only rows with no account) and card ledger rows.
-- Returns the number of savings rows removed.
create or replace function public.ledger_reverse_expense(
  p_user_id uuid,
  p_expense_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tx savings_transactions%rowtype;
  v_balance numeric(14,2);
  v_count integer := 0;
begin
  perform private.ledger_assert_caller(p_user_id);
  for v_tx in
    select * from savings_transactions
      where expense_id = p_expense_id and user_id = p_user_id
      order by created_at, id
      for update
  loop
    if v_tx.account_id is not null and v_tx.amount <> 0 then
      update user_savings_accounts
        set balance = balance - v_tx.amount, updated_at = now()
        where id = v_tx.account_id
        returning balance into v_balance;
      if not found then
        raise exception 'Account not found';
      end if;
      if v_balance < 0 then
        raise exception 'Insufficient balance for reversal';
      end if;
      perform private.ledger_audit_append(p_user_id, 'expense.reverse', 'savings_account', v_tx.account_id,
        -v_tx.amount, v_balance, null,
        jsonb_build_object('transaction_id', v_tx.id, 'expense_id', p_expense_id));
    end if;
    delete from savings_transactions where id = v_tx.id and user_id = p_user_id;
    v_count := v_count + 1;
  end loop;

  delete from budget_transactions where expense_id = p_expense_id and user_id = p_user_id;
  return v_count;
end;
$$;

revoke all on function public.ledger_apply_savings_transaction(uuid, numeric, text, timestamptz, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, text, uuid, text) from public, anon;
revoke all on function public.ledger_delete_savings_transaction(uuid, uuid) from public, anon;
revoke all on function public.ledger_reverse_expense(uuid, uuid) from public, anon;
grant execute on function public.ledger_apply_savings_transaction(uuid, numeric, text, timestamptz, text, uuid, uuid, uuid, uuid, uuid, uuid, boolean, text, uuid, text) to authenticated, service_role;
grant execute on function public.ledger_delete_savings_transaction(uuid, uuid) to authenticated, service_role;
grant execute on function public.ledger_reverse_expense(uuid, uuid) to authenticated, service_role;
