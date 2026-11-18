-- 076: Expense delete refuses instead of skipping a restore (decision on the
-- DATA-003 follow-up).
--
-- 073's expense_delete_with_ledger skipped a restore it couldn't make (the
-- loan / personal loan / BNPL plan no longer there, or the fund no longer
-- holding enough to reverse a recurring-invest payment), deleted the expense
-- anyway and returned a warning. Now the whole delete is refused with a clear
-- message and nothing changes.
--
-- Note: expenses' links to loans, other_loans, bnpl_plans and investment_funds
-- are ON DELETE SET NULL, so deleting one of those clears the link and the
-- delete simply skips that step; the "no longer exists" errors are a guard.
-- The fund check is the one users can actually hit.
--
-- Same signature and return shape as 073 ("warnings" is now always []), so
-- code deployed before or after this migration keeps working. Both delete
-- paths (DELETE /api/expenses/[id] and the unified transactions list) now pass
-- p_restore_bnpl = true and p_reverse_fund = true.
--
-- Requires 073. Idempotent.

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
  v_value numeric;
  v_fund_balance numeric;
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
    if not found then
      raise exception 'Can''t delete this payment: the loan it paid no longer exists.';
    end if;
    perform private.ledger_audit_append(p_user_id, 'expense.delete', 'loan', v_exp.loan_id,
      v_exp.amount, v_value, null, jsonb_build_object('expense_id', p_expense_id));
  end if;

  if v_exp.auto_category = 'debt' and v_exp.other_loan_id is not null then
    update other_loans
      set outstanding = round(outstanding + v_exp.amount, 2),
          amount_paid = round(greatest(0, amount_paid - v_exp.amount), 2),
          paid_at = null,
          updated_at = now()
      where id = v_exp.other_loan_id and user_id = p_user_id
      returning outstanding into v_value;
    if not found then
      raise exception 'Can''t delete this payment: the personal loan it paid no longer exists.';
    end if;
    perform private.ledger_audit_append(p_user_id, 'expense.delete', 'other_loan', v_exp.other_loan_id,
      v_exp.amount, v_value, null, jsonb_build_object('expense_id', p_expense_id));
  end if;

  if p_restore_bnpl and v_exp.auto_category = 'bnpl' and v_exp.bnpl_id is not null then
    update bnpl_plans
      set months_paid = greatest(0, least(tenure_months, months_paid - 1)), updated_at = now()
      where id = v_exp.bnpl_id and user_id = p_user_id
      returning months_paid into v_value;
    if not found then
      raise exception 'Can''t delete this payment: the BNPL plan it paid no longer exists.';
    end if;
    perform private.ledger_audit_append(p_user_id, 'expense.delete', 'bnpl_plan', v_exp.bnpl_id,
      -1, v_value, null, jsonb_build_object('expense_id', p_expense_id));
  end if;

  if p_reverse_fund and v_exp.auto_category = 'invest' and v_exp.fund_id is not null then
    select balance into v_fund_balance from investment_funds
      where id = v_exp.fund_id and user_id = p_user_id
      for update;
    if not found then
      raise exception 'Can''t delete this payment: the fund it went into no longer exists.';
    end if;
    if v_fund_balance < round(v_exp.amount, 2) then
      raise exception 'Can''t delete this payment: the fund no longer holds enough to reverse it (it has $%, this payment was $%).',
        to_char(v_fund_balance, 'FM999,999,999,990.00'), to_char(v_exp.amount, 'FM999,999,999,990.00');
    end if;
    perform public.ledger_apply_fund_transaction(
      p_user_id => p_user_id,
      p_fund_id => v_exp.fund_id,
      p_amount => -v_exp.amount,
      p_kind => 'withdrawal',
      p_note => 'Reversed recurring invest payment'
    );
  end if;

  return jsonb_build_object('expense', to_jsonb(v_exp), 'warnings', '[]'::jsonb);
end;
$$;

revoke all on function public.expense_delete_with_ledger(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.expense_delete_with_ledger(uuid, uuid, boolean, boolean) to authenticated, service_role;
