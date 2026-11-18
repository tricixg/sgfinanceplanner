-- 073: Atomic expense create / delete with their ledger effects (DATA-003)
-- + idempotency key on expenses.
--
-- POST /api/expenses used to: insert the expense, then adjust the loan / BNPL
-- plan / fund, then write the cash withdrawal or card ledger row — each a
-- separate call, with unchecked compensating deletes on failure. A retried
-- POST created a second expense AND a second withdrawal.
--
-- * expense_create_with_ledger: all of it in one transaction; an optional
--   client_request_id (unique per user) makes a retry return the first expense.
-- * expense_delete_with_ledger: reverse the ledger, delete the expense, then
--   restore loan / other loan / BNPL / fund in the same transaction. Restores
--   that used to be "log and carry on" (target missing, fund can't cover the
--   reversal) are still skipped, and reported back as warnings.
--
-- SECURITY INVOKER (RLS applies). Requires 069–072. Idempotent.

alter table public.expenses
  add column if not exists client_request_id text;

do $$ begin
  alter table public.expenses
    add constraint expenses_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create unique index if not exists expenses_user_client_request_idx
  on public.expenses (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- Inserts one row built from a JSON object (keys = column names) and returns
-- it as JSON. Columns not in the object keep their defaults. Runs as the
-- caller (SECURITY INVOKER), so RLS applies.
create or replace function private.ledger_insert_row(p_table regclass, p_row jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cols text;
  v_out jsonb;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_cols
    from pg_catalog.pg_attribute a
    where a.attrelid = p_table
      and a.attnum > 0
      and not a.attisdropped
      and p_row ? a.attname::text;
  if v_cols is null then
    raise exception 'ledger_insert_row: no known columns for %', p_table;
  end if;
  execute format(
    'insert into %s as t (%s) select %s from pg_catalog.jsonb_populate_record(null::%s, $1) returning pg_catalog.to_jsonb(t.*)',
    p_table, v_cols, v_cols, p_table
  ) using p_row into v_out;
  return v_out;
end;
$$;

revoke all on function private.ledger_insert_row(regclass, jsonb) from public;
grant execute on function private.ledger_insert_row(regclass, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- p_expense : expenses columns (user_id / client_request_id are set here)
-- p_loan_id : instalment loan paid by this expense (outstanding -= amount)
-- p_bnpl_id : BNPL plan paid by this expense (months_paid += 1)
-- p_fund    : {"fund_id": uuid, "note": text} — deposit amount into the fund
-- p_ledger  : null, or {"type": "savings", "account_id", "occurred_at", "note"}
--             (cash withdrawal), or {"type": "budget", "row": {...}} (card
--             ledger row; expense_id and user_id are set here)
create or replace function public.expense_create_with_ledger(
  p_user_id uuid,
  p_expense jsonb,
  p_loan_id uuid default null,
  p_bnpl_id uuid default null,
  p_fund jsonb default null,
  p_ledger jsonb default null,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing expenses%rowtype;
  v_expense jsonb;
  v_expense_id uuid;
  v_amount numeric;
begin
  perform private.ledger_assert_caller(p_user_id);

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('expenses', p_user_id, p_client_request_id);
    select * into v_existing from expenses
      where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      return jsonb_build_object('expense', to_jsonb(v_existing), 'replayed', true);
    end if;
  end if;

  v_expense := private.ledger_insert_row(
    'public.expenses',
    (coalesce(p_expense, '{}'::jsonb) - 'id' - 'client_request_id')
      || jsonb_build_object('user_id', p_user_id, 'client_request_id', p_client_request_id)
  );
  v_expense_id := (v_expense ->> 'id')::uuid;
  v_amount := (v_expense ->> 'amount')::numeric;

  if p_loan_id is not null then
    perform public.ledger_adjust_loan_outstanding(p_user_id, p_loan_id, -v_amount);
  end if;

  if p_bnpl_id is not null then
    perform public.ledger_adjust_bnpl_months_paid(p_user_id, p_bnpl_id, 1);
  end if;

  if p_fund is not null then
    perform public.ledger_apply_fund_transaction(
      p_user_id => p_user_id,
      p_fund_id => (p_fund ->> 'fund_id')::uuid,
      p_amount => v_amount,
      p_kind => 'deposit',
      p_note => coalesce(p_fund ->> 'note', '')
    );
  end if;

  if p_ledger is not null then
    if p_ledger ->> 'type' = 'savings' then
      perform public.ledger_apply_savings_transaction(
        p_user_id => p_user_id,
        p_amount => -v_amount,
        p_kind => 'withdrawal',
        p_occurred_at => (p_ledger ->> 'occurred_at')::timestamptz,
        p_note => coalesce(p_ledger ->> 'note', ''),
        p_account_id => (p_ledger ->> 'account_id')::uuid,
        p_expense_id => v_expense_id
      );
    elsif p_ledger ->> 'type' = 'budget' then
      perform private.ledger_insert_row(
        'public.budget_transactions',
        coalesce(p_ledger -> 'row', '{}'::jsonb)
          || jsonb_build_object('user_id', p_user_id, 'expense_id', v_expense_id)
      );
    else
      raise exception 'Unknown ledger type';
    end if;
  end if;

  return jsonb_build_object('expense', v_expense, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Returns null when the expense doesn't exist (or isn't the caller's);
-- otherwise {"expense": <deleted row>, "warnings": [text, ...]}.
create or replace function public.expense_delete_with_ledger(
  p_user_id uuid,
  p_expense_id uuid,
  p_restore_bnpl boolean default true,
  p_reverse_fund boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_exp expenses%rowtype;
  v_warnings text[] := '{}';
  v_value numeric;
begin
  perform private.ledger_assert_caller(p_user_id);

  select * into v_exp from expenses
    where id = p_expense_id and user_id = p_user_id
    for update;
  if not found then
    return null;
  end if;

  -- Throws (and so deletes nothing) if a cash restore would overdraw.
  perform public.ledger_reverse_expense(p_user_id, p_expense_id);

  delete from expenses where id = p_expense_id and user_id = p_user_id;

  if v_exp.auto_category = 'debt' and v_exp.loan_id is not null then
    update loans
      set outstanding = greatest(0, round(outstanding + v_exp.amount, 2)), updated_at = now()
      where id = v_exp.loan_id and user_id = p_user_id
      returning outstanding into v_value;
    if found then
      perform private.ledger_audit_append(p_user_id, 'expense.delete', 'loan', v_exp.loan_id,
        v_exp.amount, v_value, null, jsonb_build_object('expense_id', p_expense_id));
    else
      v_warnings := v_warnings || 'loan restore failed: Loan not found';
    end if;
  end if;

  if v_exp.auto_category = 'debt' and v_exp.other_loan_id is not null then
    update other_loans
      set outstanding = round(outstanding + v_exp.amount, 2),
          amount_paid = round(greatest(0, amount_paid - v_exp.amount), 2),
          paid_at = null,
          updated_at = now()
      where id = v_exp.other_loan_id and user_id = p_user_id
      returning outstanding into v_value;
    if found then
      perform private.ledger_audit_append(p_user_id, 'expense.delete', 'other_loan', v_exp.other_loan_id,
        v_exp.amount, v_value, null, jsonb_build_object('expense_id', p_expense_id));
    else
      v_warnings := v_warnings || 'other-loan restore failed: Loan not found';
    end if;
  end if;

  if p_restore_bnpl and v_exp.auto_category = 'bnpl' and v_exp.bnpl_id is not null then
    update bnpl_plans
      set months_paid = greatest(0, least(tenure_months, months_paid - 1)), updated_at = now()
      where id = v_exp.bnpl_id and user_id = p_user_id
      returning months_paid into v_value;
    if found then
      perform private.ledger_audit_append(p_user_id, 'expense.delete', 'bnpl_plan', v_exp.bnpl_id,
        -1, v_value, null, jsonb_build_object('expense_id', p_expense_id));
    else
      v_warnings := v_warnings || 'bnpl restore failed: BNPL plan not found';
    end if;
  end if;

  if p_reverse_fund and v_exp.auto_category = 'invest' and v_exp.fund_id is not null then
    begin
      perform public.ledger_apply_fund_transaction(
        p_user_id => p_user_id,
        p_fund_id => v_exp.fund_id,
        p_amount => -v_exp.amount,
        p_kind => 'withdrawal',
        p_note => 'Reversed recurring invest payment'
      );
    exception when others then
      -- Same as before: the expense is still deleted, the fund is left as is.
      v_warnings := v_warnings || ('fund reversal failed: ' || sqlerrm);
    end;
  end if;

  return jsonb_build_object('expense', to_jsonb(v_exp), 'warnings', to_jsonb(v_warnings));
end;
$$;

revoke all on function public.expense_create_with_ledger(uuid, jsonb, uuid, uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.expense_delete_with_ledger(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.expense_create_with_ledger(uuid, jsonb, uuid, uuid, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function public.expense_delete_with_ledger(uuid, uuid, boolean, boolean) to authenticated, service_role;
