-- 072: Atomic loan / BNPL / other-loan balance changes (DATA-003).
--
-- * ledger_adjust_loan_outstanding   — loans.outstanding += delta, floor 0
-- * ledger_adjust_bnpl_months_paid   — bnpl_plans.months_paid += delta, 0..tenure
-- * other_loan_record_payment        — expense + cash withdrawal (or record-only
--                                      history row) + loan totals, one transaction
-- * other_loan_add_draw_down         — cash deposit (or record-only row) + loan
--                                      totals, one transaction
-- * other_loan_restore_payment / other_loan_restore_draw_down — undo helpers
--
-- Same clamps and rounding as the TypeScript they replace. SECURITY INVOKER
-- (RLS applies). Requires 069 and 070. Idempotent.

create or replace function public.ledger_adjust_loan_outstanding(
  p_user_id uuid,
  p_loan_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_outstanding numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  update loans
    set outstanding = greatest(0, round(outstanding + p_delta, 2)), updated_at = now()
    where id = p_loan_id and user_id = p_user_id
    returning outstanding into v_outstanding;
  if not found then
    raise exception 'Loan not found';
  end if;
  perform private.ledger_audit_append(p_user_id, 'loan.adjust', 'loan', p_loan_id,
    p_delta, v_outstanding, null, '{}'::jsonb);
  return v_outstanding;
end;
$$;

create or replace function public.ledger_adjust_bnpl_months_paid(
  p_user_id uuid,
  p_bnpl_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_months integer;
begin
  perform private.ledger_assert_caller(p_user_id);
  update bnpl_plans
    set months_paid = greatest(0, least(tenure_months, months_paid + p_delta)), updated_at = now()
    where id = p_bnpl_id and user_id = p_user_id
    returning months_paid into v_months;
  if not found then
    raise exception 'BNPL plan not found';
  end if;
  perform private.ledger_audit_append(p_user_id, 'bnpl.adjust', 'bnpl_plan', p_bnpl_id,
    p_delta, v_months, null, '{}'::jsonb);
  return v_months;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.other_loan_record_payment(
  p_user_id uuid,
  p_loan_id uuid,
  p_amount numeric,
  p_savings_account_id uuid,
  p_financial_account_id uuid,
  p_category text,
  p_spent_at date,
  p_spent_time time,
  p_occurred_at timestamptz,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_loan other_loans%rowtype;
  v_expense_id uuid;
  v_outstanding numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  select * into v_loan from other_loans
    where id = p_loan_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.loan_type = 'balance_transfer' then
    raise exception 'Balance transfer is paid from Credit Cards statement payment';
  end if;
  if p_amount > v_loan.outstanding + 0.01 then
    raise exception 'Payment exceeds outstanding (%)', trim_scale(v_loan.outstanding);
  end if;

  -- Mirrors the instalment-loan auto-payment expense (auto_category "debt").
  insert into expenses (
    user_id, amount, category, auto_category, other_loan_id, spent_at, spent_time,
    note, financial_account_id, entry_source
  ) values (
    p_user_id, p_amount, p_category, 'debt', p_loan_id, p_spent_at, p_spent_time,
    coalesce(p_note, ''), p_financial_account_id, 'manual'
  )
  returning id into v_expense_id;

  if p_savings_account_id is not null then
    perform public.ledger_apply_savings_transaction(
      p_user_id => p_user_id,
      p_amount => -p_amount,
      p_kind => 'withdrawal',
      p_occurred_at => p_occurred_at,
      p_note => p_note,
      p_account_id => p_savings_account_id,
      p_expense_id => v_expense_id,
      p_source_record_type => 'other_loan',
      p_source_record_id => p_loan_id
    );
  else
    -- No account: payment history only, no balance touched (migration 037).
    insert into savings_transactions (
      user_id, account_id, pool_id, kind, amount, balance_after, note, occurred_at,
      expense_id, source_record_type, source_record_id
    ) values (
      p_user_id, null, null, 'withdrawal', -p_amount, 0, coalesce(p_note, ''), p_occurred_at,
      v_expense_id, 'other_loan', p_loan_id
    );
  end if;

  update other_loans
    set amount_paid = round(amount_paid + p_amount, 2),
        outstanding = round(outstanding - p_amount, 2),
        paid_at = case when round(outstanding - p_amount, 2) <= 0 then now() else null end,
        updated_at = now()
    where id = p_loan_id
    returning outstanding into v_outstanding;

  perform private.ledger_audit_append(p_user_id, 'other_loan.payment', 'other_loan', p_loan_id,
    -p_amount, v_outstanding, null, jsonb_build_object('expense_id', v_expense_id));
  return v_expense_id;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.other_loan_add_draw_down(
  p_user_id uuid,
  p_loan_id uuid,
  p_amount numeric,
  p_savings_account_id uuid,
  p_occurred_at timestamptz,
  p_note text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_loan other_loans%rowtype;
  v_outstanding numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  select * into v_loan from other_loans
    where id = p_loan_id and user_id = p_user_id
    for update;
  if not found then
    raise exception 'Loan not found';
  end if;
  if v_loan.loan_type = 'balance_transfer' then
    raise exception 'Balance transfers cannot be topped up this way';
  end if;

  if p_savings_account_id is not null then
    perform public.ledger_apply_savings_transaction(
      p_user_id => p_user_id,
      p_amount => p_amount,
      p_kind => 'deposit',
      p_occurred_at => p_occurred_at,
      p_note => p_note,
      p_account_id => p_savings_account_id,
      p_source_record_type => 'other_loan',
      p_source_record_id => p_loan_id
    );
  else
    insert into savings_transactions (
      user_id, account_id, pool_id, kind, amount, balance_after, note, occurred_at,
      source_record_type, source_record_id
    ) values (
      p_user_id, null, null, 'deposit', p_amount, 0, coalesce(p_note, ''), p_occurred_at,
      'other_loan', p_loan_id
    );
  end if;

  update other_loans
    set outstanding = round(outstanding + p_amount, 2),
        principal = round(principal + p_amount, 2),
        paid_at = null,
        updated_at = now()
    where id = p_loan_id
    returning outstanding into v_outstanding;

  perform private.ledger_audit_append(p_user_id, 'other_loan.draw_down', 'other_loan', p_loan_id,
    p_amount, v_outstanding, null, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.other_loan_restore_payment(
  p_user_id uuid,
  p_loan_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_outstanding numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  update other_loans
    set outstanding = round(outstanding + p_amount, 2),
        amount_paid = round(greatest(0, amount_paid - p_amount), 2),
        paid_at = null,
        updated_at = now()
    where id = p_loan_id and user_id = p_user_id
    returning outstanding into v_outstanding;
  if not found then
    raise exception 'Loan not found';
  end if;
  perform private.ledger_audit_append(p_user_id, 'other_loan.restore_payment', 'other_loan', p_loan_id,
    p_amount, v_outstanding, null, '{}'::jsonb);
end;
$$;

create or replace function public.other_loan_restore_draw_down(
  p_user_id uuid,
  p_loan_id uuid,
  p_amount numeric
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_outstanding numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  update other_loans
    set outstanding = round(greatest(0, outstanding - p_amount), 2),
        principal = round(greatest(0, principal - p_amount), 2),
        updated_at = now()
    where id = p_loan_id and user_id = p_user_id
    returning outstanding into v_outstanding;
  if not found then
    raise exception 'Loan not found';
  end if;
  perform private.ledger_audit_append(p_user_id, 'other_loan.restore_draw_down', 'other_loan', p_loan_id,
    -p_amount, v_outstanding, null, '{}'::jsonb);
end;
$$;

revoke all on function public.ledger_adjust_loan_outstanding(uuid, uuid, numeric) from public, anon;
revoke all on function public.ledger_adjust_bnpl_months_paid(uuid, uuid, integer) from public, anon;
revoke all on function public.other_loan_record_payment(uuid, uuid, numeric, uuid, uuid, text, date, time, timestamptz, text) from public, anon;
revoke all on function public.other_loan_add_draw_down(uuid, uuid, numeric, uuid, timestamptz, text) from public, anon;
revoke all on function public.other_loan_restore_payment(uuid, uuid, numeric) from public, anon;
revoke all on function public.other_loan_restore_draw_down(uuid, uuid, numeric) from public, anon;
grant execute on function public.ledger_adjust_loan_outstanding(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.ledger_adjust_bnpl_months_paid(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.other_loan_record_payment(uuid, uuid, numeric, uuid, uuid, text, date, time, timestamptz, text) to authenticated, service_role;
grant execute on function public.other_loan_add_draw_down(uuid, uuid, numeric, uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.other_loan_restore_payment(uuid, uuid, numeric) to authenticated, service_role;
grant execute on function public.other_loan_restore_draw_down(uuid, uuid, numeric) to authenticated, service_role;
