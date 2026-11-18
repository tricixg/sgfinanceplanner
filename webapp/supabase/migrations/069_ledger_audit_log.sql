-- 069: Append-only audit log for balance-changing ledger operations (OPS-002).
--
-- Written ONLY from inside the ledger functions added in 070–073, in the same
-- transaction as the balance change, via private.ledger_audit_append(). Users
-- can read their own rows; nobody can insert, update or delete them through
-- the API.
--
-- Idempotent: safe to run more than once.

create schema if not exists private;
-- `private` is not in PostgREST's exposed schemas (Supabase exposes `public`
-- and `graphql_public` by default), so functions here cannot be called over
-- the REST API. The ledger functions in `public` call them from SQL.
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table if not exists public.ledger_audit_log (
  id bigint generated always as identity primary key,
  -- The person who performed the operation (auth.uid(); the target user for
  -- service-role callers such as the Telegram bot).
  user_id uuid not null references auth.users (id) on delete cascade,
  -- e.g. savings.apply, savings.delete, expense.reverse, fund.apply, cpf.contribution.add
  operation text not null,
  -- The balance that moved: savings_account, savings_pool, savings_goal,
  -- investment_fund, loan, other_loan, bnpl_plan, cpf_oa, cpf_sa, cpf_ma, expense
  entity_type text not null,
  entity_id uuid,
  delta numeric,
  balance_after numeric,
  idempotency_key text,
  -- Extra context: ledger row id, expense id, kind, clamp info. Never notes.
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ledger_audit_log_user_created_idx
  on public.ledger_audit_log (user_id, created_at desc);
create index if not exists ledger_audit_log_entity_idx
  on public.ledger_audit_log (entity_type, entity_id, created_at desc);

alter table public.ledger_audit_log enable row level security;

drop policy if exists "Users read own ledger audit log" on public.ledger_audit_log;
create policy "Users read own ledger audit log"
  on public.ledger_audit_log for select
  to authenticated
  using (user_id = auth.uid());
-- No insert / update / delete policies: with RLS on, API users cannot write.

revoke insert, update, delete, truncate on public.ledger_audit_log from anon, authenticated;
grant select on public.ledger_audit_log to authenticated;

-- Rows are never edited, by anyone (deletes stay possible for the table owner
-- and service role, e.g. account erasure via the auth.users cascade).
create or replace function private.ledger_audit_log_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ledger_audit_log rows are append-only';
end;
$$;

drop trigger if exists ledger_audit_log_no_update on public.ledger_audit_log;
create trigger ledger_audit_log_no_update
  before update on public.ledger_audit_log
  for each row execute function private.ledger_audit_log_no_update();

-- SECURITY DEFINER (the one exception to "security invoker"): the ledger
-- functions run as the calling user, who has no insert right on the log. This
-- function is the only way rows get in. It always records auth.uid() when
-- there is one, so a caller cannot write rows for someone else.
create or replace function private.ledger_audit_append(
  p_user_id uuid,
  p_operation text,
  p_entity_type text,
  p_entity_id uuid,
  p_delta numeric,
  p_balance_after numeric,
  p_idempotency_key text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(auth.uid(), p_user_id);
begin
  if v_user is null then
    raise exception 'ledger audit: no user';
  end if;
  insert into public.ledger_audit_log
    (user_id, operation, entity_type, entity_id, delta, balance_after, idempotency_key, details)
  values
    (v_user, p_operation, p_entity_type, p_entity_id, p_delta, p_balance_after,
     p_idempotency_key, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke all on function private.ledger_audit_append(uuid, text, text, uuid, numeric, numeric, text, jsonb) from public;
grant execute on function private.ledger_audit_append(uuid, text, text, uuid, numeric, numeric, text, jsonb)
  to authenticated, service_role;
