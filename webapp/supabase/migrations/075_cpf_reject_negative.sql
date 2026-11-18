-- 075: CPF balances never go below $0 silently (decision on DATA-003 follow-up).
--
-- Until now deleting/editing a contribution or logging an OA debit floored
-- OA/SA/MA at 0 (greatest(0, …)), so add-then-delete didn't always return to
-- the starting balance. Now any change that would take a balance below $0 is
-- REJECTED with a clear message and nothing is written; otherwise the delta is
-- applied exactly. Adding a contribution or a credit (delta >= 0) is never
-- blocked, even if a balance was already negative.
--
-- Replaces private.cpf_profile_apply from 074 in place (same signature, so the
-- 074 functions that call it pick this up unchanged). The boolean argument is
-- still called p_floor_zero for signature compatibility; it now means
-- "reject a result below zero".
--
-- Requires 074. Idempotent.

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
  v_d_oa numeric := coalesce(p_d_oa, 0);
  v_d_sa numeric := coalesce(p_d_sa, 0);
  v_d_ma numeric := coalesce(p_d_ma, 0);
  v_bucket text;
  v_current numeric;
begin
  if v_d_oa = 0 and v_d_sa = 0 and v_d_ma = 0 then
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

  if p_floor_zero then
    if v_d_oa < 0 and v_before.oa + v_d_oa < 0 then
      v_bucket := 'OA'; v_current := v_before.oa;
    elsif v_d_sa < 0 and v_before.sa + v_d_sa < 0 then
      v_bucket := 'SA'; v_current := v_before.sa;
    elsif v_d_ma < 0 and v_before.ma + v_d_ma < 0 then
      v_bucket := 'MA'; v_current := v_before.ma;
    end if;
    if v_bucket is not null then
      raise exception 'This would take your CPF % below $0 (it is $% now). Correct your % balance first, or change this entry.',
        v_bucket, to_char(v_current, 'FM999,999,999,990.00'), v_bucket;
    end if;
  end if;

  update user_finance_profile
    set oa = oa + v_d_oa,
        sa = sa + v_d_sa,
        ma = ma + v_d_ma,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_after;

  if v_d_oa <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_oa', p_user_id,
      v_d_oa, v_after.oa, p_key, coalesce(p_details, '{}'::jsonb));
  end if;
  if v_d_sa <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_sa', p_user_id,
      v_d_sa, v_after.sa, p_key, coalesce(p_details, '{}'::jsonb));
  end if;
  if v_d_ma <> 0 then
    perform private.ledger_audit_append(p_user_id, p_operation, 'cpf_ma', p_user_id,
      v_d_ma, v_after.ma, p_key, coalesce(p_details, '{}'::jsonb));
  end if;

  return jsonb_build_object('oa', v_after.oa, 'sa', v_after.sa, 'ma', v_after.ma);
end;
$$;

revoke all on function private.cpf_profile_apply(uuid, text, numeric, numeric, numeric, boolean, text, jsonb) from public;
grant execute on function private.cpf_profile_apply(uuid, text, numeric, numeric, numeric, boolean, text, jsonb) to authenticated, service_role;
