-- 078: Miles tracker by lot — KrisFlyer miles and card points, each logged with
-- the month it was earned and the month it expires, plus conversions and
-- redemptions that draw points from the oldest lots first.
--
-- Replaces the single-balance-per-bank model of 041 (miles_balances is left in
-- place, unused, so no data is lost).
--
--   miles_lots           one row per lot: programme, earned month, expiry month,
--                        amount and how much of it has been used
--   miles_activity       conversions (card points -> KrisFlyer miles) and
--                        redemptions (KrisFlyer miles spent on an award)
--   miles_activity_lots  which lots each activity took points from, so Undo
--                        can put them back exactly
--
-- Months are stored as the first day of the month. A lot is usable up to and
-- including the last day of its expiry month; null expiry = never expires.
--
-- Every balance change goes through a SECURITY INVOKER function below (RLS
-- applies), in one transaction, with an audit row (069). The programme rules
-- mirror lib/miles/programs.ts:
--   krisflyer         miles; expire 36 months after the month earned
--   dbs_womans_world  1 point = 2 miles, blocks of 5,000, S$27.25 per conversion
--   dbs_altitude      1 point = 2 miles, blocks of 5,000, S$27.25, no expiry
--   uob               UNI$1 = 2 miles, blocks of 5,000, S$27; 24 months after
--                     the quarter earned
--
-- Requires 069 and 070. Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
create table if not exists public.miles_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  program text not null,
  earned_month date,
  expiry_month date,
  amount numeric(14,0) not null,
  used numeric(14,0) not null default 0,
  -- earned: logged by hand; balance_update: UOB balance increase dated the day
  -- it was logged; conversion: KrisFlyer miles created by miles_convert.
  source text not null default 'earned',
  converted_from text,
  note text not null default '',
  logged_on date,
  client_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table public.miles_lots add constraint miles_lots_program_chk
    check (program in ('krisflyer', 'dbs_womans_world', 'dbs_altitude', 'uob'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.miles_lots add constraint miles_lots_source_chk
    check (source in ('earned', 'balance_update', 'conversion'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.miles_lots add constraint miles_lots_amount_chk
    check (amount >= 0 and used >= 0 and used <= amount);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.miles_lots add constraint miles_lots_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create index if not exists miles_lots_user_program_idx
  on public.miles_lots (user_id, program, expiry_month);
create unique index if not exists miles_lots_user_client_request_idx
  on public.miles_lots (user_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.miles_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  -- Card the points came from (convert), or 'krisflyer' (redeem).
  program text not null,
  activity_month date not null,
  -- Points (convert) or miles (redeem) taken from the lots.
  amount numeric(14,0) not null,
  -- KrisFlyer miles credited (convert) or spent (redeem).
  miles numeric(14,0) not null,
  fee numeric(10,2) not null default 0,
  description text not null default '',
  created_lot_id uuid references public.miles_lots (id) on delete set null,
  client_request_id text,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.miles_activity add constraint miles_activity_kind_chk
    check (kind in ('convert', 'redeem'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table public.miles_activity add constraint miles_activity_client_request_id_len
    check (client_request_id is null or char_length(client_request_id) between 1 and 100);
exception when duplicate_object then null;
end $$;

create index if not exists miles_activity_user_idx
  on public.miles_activity (user_id, activity_month desc, created_at desc);
create unique index if not exists miles_activity_user_client_request_idx
  on public.miles_activity (user_id, client_request_id)
  where client_request_id is not null;

create table if not exists public.miles_activity_lots (
  activity_id uuid not null references public.miles_activity (id) on delete cascade,
  lot_id uuid not null references public.miles_lots (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(14,0) not null check (amount > 0),
  primary key (activity_id, lot_id)
);

create index if not exists miles_activity_lots_lot_idx on public.miles_activity_lots (lot_id);

alter table public.miles_lots enable row level security;
alter table public.miles_activity enable row level security;
alter table public.miles_activity_lots enable row level security;

drop policy if exists "Users manage own miles lots" on public.miles_lots;
create policy "Users manage own miles lots" on public.miles_lots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own miles activity" on public.miles_activity;
create policy "Users manage own miles activity" on public.miles_activity
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users manage own miles activity lots" on public.miles_activity_lots;
create policy "Users manage own miles activity lots" on public.miles_activity_lots
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.miles_lots, public.miles_activity, public.miles_activity_lots
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Helpers (private: not callable over the REST API)

-- Current month in Singapore, as the first day of the month.
create or replace function private.miles_this_month()
returns date
language sql
stable
set search_path = ''
as $$
  select pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'Asia/Singapore')::date;
$$;

-- Conversion rule per card: miles per point, smallest block, fee per conversion.
create or replace function private.miles_card_rule(p_program text, out ratio int, out block int, out fee numeric)
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_program
    when 'dbs_womans_world' then ratio := 2; block := 5000; fee := 27.25;
    when 'dbs_altitude' then ratio := 2; block := 5000; fee := 27.25;
    when 'uob' then ratio := 2; block := 5000; fee := 27;
    else raise exception 'Only card points can be converted';
  end case;
end;
$$;

-- One lock per user + programme, so two conversions can't spend the same points.
create or replace function private.miles_lock(p_user_id uuid, p_program text)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('miles:' || p_user_id::text || ':' || p_program, 0)
  );
$$;

-- Points of a programme usable in a given month.
create or replace function private.miles_available(p_user_id uuid, p_program text, p_month date)
returns numeric
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount - used), 0)
  from miles_lots
  where user_id = p_user_id and program = p_program and amount > used
    and (earned_month is null or earned_month <= p_month)
    and (expiry_month is null or expiry_month >= p_month);
$$;

-- Takes p_qty from the programme's lots, soonest-expiring first (lots with no
-- expiry last, then oldest first). Records each draw against p_activity_id
-- when given. Caller holds private.miles_lock and has checked availability.
create or replace function private.miles_take_oldest(
  p_user_id uuid, p_program text, p_month date, p_qty numeric, p_activity_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_left numeric := p_qty;
  v_take numeric;
  v_lot miles_lots%rowtype;
begin
  for v_lot in
    select * from miles_lots
    where user_id = p_user_id and program = p_program and amount > used
      and (earned_month is null or earned_month <= p_month)
      and (expiry_month is null or expiry_month >= p_month)
    order by expiry_month nulls last, earned_month nulls first, created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_lot.amount - v_lot.used, v_left);
    update miles_lots set used = used + v_take, updated_at = now() where id = v_lot.id;
    if p_activity_id is not null then
      insert into miles_activity_lots (activity_id, lot_id, user_id, amount)
        values (p_activity_id, v_lot.id, p_user_id, v_take);
    end if;
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then
    raise exception 'Not enough points available';
  end if;
end;
$$;

revoke all on function private.miles_this_month() from public;
revoke all on function private.miles_card_rule(text) from public;
revoke all on function private.miles_lock(uuid, text) from public;
revoke all on function private.miles_available(uuid, text, date) from public;
revoke all on function private.miles_take_oldest(uuid, text, date, numeric, uuid) from public;
grant execute on function private.miles_this_month() to authenticated, service_role;
grant execute on function private.miles_card_rule(text) to authenticated, service_role;
grant execute on function private.miles_lock(uuid, text) to authenticated, service_role;
grant execute on function private.miles_available(uuid, text, date) to authenticated, service_role;
grant execute on function private.miles_take_oldest(uuid, text, date, numeric, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Add a lot: KrisFlyer miles (earned month; expiry defaults to 36 months on),
-- Altitude points (no dates), or UOB UNI$ with a known expiry (setting up).
create or replace function public.miles_add_lot(
  p_user_id uuid,
  p_program text,
  p_amount numeric,
  p_earned_month date default null,
  p_expiry_month date default null,
  p_note text default '',
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric := round(p_amount);
  v_now date := private.miles_this_month();
  v_earned date := date_trunc('month', p_earned_month)::date;
  v_expiry date := date_trunc('month', p_expiry_month)::date;
  v_row miles_lots%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_amount is null or v_amount <= 0 then
    raise exception 'Enter a positive amount';
  end if;

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('miles_lots', p_user_id, p_client_request_id);
    select * into v_row from miles_lots where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      return jsonb_build_object('lot', to_jsonb(v_row), 'replayed', true);
    end if;
  end if;

  if p_program = 'krisflyer' then
    if v_earned is null then
      raise exception 'Enter the month the miles were earned';
    end if;
    v_expiry := coalesce(v_expiry, (v_earned + interval '36 months')::date);
  elsif p_program = 'dbs_altitude' then
    v_earned := v_now;
    v_expiry := null;
  elsif p_program = 'uob' then
    if v_expiry is null then
      raise exception 'Enter the expiry date the UOB app shows';
    end if;
    v_earned := least((date_trunc('quarter', v_expiry) - interval '24 months')::date, v_now);
  elsif p_program = 'dbs_womans_world' then
    raise exception 'Log Woman''s World points by expiry month';
  else
    raise exception 'Unknown programme';
  end if;

  insert into miles_lots (user_id, program, earned_month, expiry_month, amount, source, note, logged_on, client_request_id)
    values (p_user_id, p_program, v_earned, v_expiry, v_amount, 'earned', coalesce(p_note, ''),
            (now() at time zone 'Asia/Singapore')::date, p_client_request_id)
    returning * into v_row;

  perform private.ledger_audit_append(p_user_id, 'miles.lot.add', 'miles_lot', v_row.id,
    v_amount, v_amount, p_client_request_id, jsonb_build_object('program', p_program));

  return jsonb_build_object('lot', to_jsonb(v_row), 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Woman's World: set the points expiring in a month to what the DBS app shows.
-- 0 removes the month. The new figure already reflects any conversions, so the
-- lot's "used" resets and earlier activities stop pointing at it.
create or replace function public.miles_set_expiry_bucket(
  p_user_id uuid,
  p_expiry_month date,
  p_amount numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric := round(p_amount);
  v_expiry date := date_trunc('month', p_expiry_month)::date;
  v_now date := private.miles_this_month();
  v_lot miles_lots%rowtype;
  v_before numeric := 0;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_expiry is null then
    raise exception 'Enter the expiry month';
  end if;
  if v_amount is null or v_amount < 0 then
    raise exception 'Enter 0 or more points';
  end if;
  perform private.miles_lock(p_user_id, 'dbs_womans_world');

  select * into v_lot from miles_lots
    where user_id = p_user_id and program = 'dbs_womans_world' and expiry_month = v_expiry
    order by created_at limit 1
    for update;

  if found then
    v_before := v_lot.amount - v_lot.used;
    delete from miles_activity_lots where lot_id = v_lot.id;
    if v_amount = 0 then
      delete from miles_lots where id = v_lot.id;
    else
      update miles_lots set amount = v_amount, used = 0, updated_at = now() where id = v_lot.id
        returning * into v_lot;
    end if;
  elsif v_amount > 0 then
    insert into miles_lots (user_id, program, earned_month, expiry_month, amount, source, logged_on)
      values (p_user_id, 'dbs_womans_world',
              least((v_expiry - interval '14 months')::date, v_now), v_expiry, v_amount, 'earned',
              (now() at time zone 'Asia/Singapore')::date)
      returning * into v_lot;
  else
    return jsonb_build_object('changed', false);
  end if;

  perform private.ledger_audit_append(p_user_id, 'miles.bucket.set', 'miles_lot', v_lot.id,
    v_amount - v_before, v_amount, null, jsonb_build_object('expiry_month', v_expiry));

  return jsonb_build_object('changed', true, 'delta', v_amount - v_before);
end;
$$;

-- ---------------------------------------------------------------------------
-- UOB: set the UNI$ balance to what the UOB app shows. An increase is dated
-- today and goes into today's quarter (expires 24 months after it ends); a
-- decrease comes off the soonest-expiring UNI$ first.
create or replace function public.miles_set_uob_balance(
  p_user_id uuid,
  p_balance numeric,
  p_today date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_balance numeric := round(p_balance);
  v_today date := coalesce(p_today, (now() at time zone 'Asia/Singapore')::date);
  v_month date := date_trunc('month', v_today)::date;
  v_quarter date := date_trunc('quarter', v_today)::date;
  v_expiry date;
  v_tracked numeric;
  v_delta numeric;
  v_lot_id uuid;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_balance is null or v_balance < 0 then
    raise exception 'Enter 0 or more UNI$';
  end if;
  perform private.miles_lock(p_user_id, 'uob');

  v_tracked := private.miles_available(p_user_id, 'uob', v_month);
  v_delta := v_balance - v_tracked;
  v_expiry := (v_quarter + interval '26 months')::date;

  if v_delta > 0 then
    select id into v_lot_id from miles_lots
      where user_id = p_user_id and program = 'uob' and expiry_month = v_expiry and source <> 'conversion'
      order by created_at limit 1
      for update;
    if found then
      update miles_lots set amount = amount + v_delta, logged_on = v_today, updated_at = now() where id = v_lot_id;
    else
      insert into miles_lots (user_id, program, earned_month, expiry_month, amount, source, logged_on)
        values (p_user_id, 'uob', v_quarter, v_expiry, v_delta, 'balance_update', v_today)
        returning id into v_lot_id;
    end if;
  elsif v_delta < 0 then
    perform private.miles_take_oldest(p_user_id, 'uob', v_month, -v_delta, null);
  end if;

  if v_delta <> 0 then
    perform private.ledger_audit_append(p_user_id, 'miles.uob.set_balance', 'miles_lot', v_lot_id,
      v_delta, v_balance, null, jsonb_build_object('tracked_before', v_tracked));
  end if;

  return jsonb_build_object('delta', v_delta, 'balance', v_balance, 'expiry_month', v_expiry);
end;
$$;

-- ---------------------------------------------------------------------------
-- Convert card points to KrisFlyer miles in a month: whole blocks only, oldest
-- points first. The miles become a KrisFlyer lot expiring 36 months on.
create or replace function public.miles_convert(
  p_user_id uuid,
  p_program text,
  p_month date,
  p_points numeric,
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_rule record;
  v_points numeric := round(p_points);
  v_month date := date_trunc('month', p_month)::date;
  v_available numeric;
  v_lot miles_lots%rowtype;
  v_act miles_activity%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  select * into v_rule from private.miles_card_rule(p_program);
  if v_month is null or v_month > private.miles_this_month() then
    raise exception 'Pick this month or an earlier one';
  end if;
  if v_points is null or v_points <= 0 or v_points % v_rule.block <> 0 then
    raise exception 'Convert in blocks of % points', to_char(v_rule.block, 'FM999,999');
  end if;

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('miles_activity', p_user_id, p_client_request_id);
    select * into v_act from miles_activity where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      return jsonb_build_object('activity', to_jsonb(v_act), 'replayed', true);
    end if;
  end if;

  perform private.miles_lock(p_user_id, p_program);
  v_available := private.miles_available(p_user_id, p_program, v_month);
  if v_points > v_available then
    raise exception 'You only have % points available in that month', to_char(v_available, 'FM999,999,990');
  end if;

  insert into miles_lots (user_id, program, earned_month, expiry_month, amount, source, converted_from, logged_on)
    values (p_user_id, 'krisflyer', v_month, (v_month + interval '36 months')::date, v_points * v_rule.ratio,
            'conversion', p_program, (now() at time zone 'Asia/Singapore')::date)
    returning * into v_lot;

  insert into miles_activity (user_id, kind, program, activity_month, amount, miles, fee, created_lot_id, client_request_id)
    values (p_user_id, 'convert', p_program, v_month, v_points, v_points * v_rule.ratio, v_rule.fee, v_lot.id,
            p_client_request_id)
    returning * into v_act;

  perform private.miles_take_oldest(p_user_id, p_program, v_month, v_points, v_act.id);

  perform private.ledger_audit_append(p_user_id, 'miles.convert', 'miles_activity', v_act.id,
    -v_points, v_available - v_points, p_client_request_id,
    jsonb_build_object('program', p_program, 'miles', v_points * v_rule.ratio, 'lot_id', v_lot.id));

  return jsonb_build_object('activity', to_jsonb(v_act), 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeem KrisFlyer miles in a month, soonest-expiring first (as KrisFlyer does).
create or replace function public.miles_redeem(
  p_user_id uuid,
  p_month date,
  p_miles numeric,
  p_description text default '',
  p_client_request_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_miles numeric := round(p_miles);
  v_month date := date_trunc('month', p_month)::date;
  v_available numeric;
  v_act miles_activity%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  if v_month is null or v_month > private.miles_this_month() then
    raise exception 'Pick this month or an earlier one';
  end if;
  if v_miles is null or v_miles <= 0 then
    raise exception 'Enter the miles you used';
  end if;

  if p_client_request_id is not null then
    perform private.ledger_idempotency_lock('miles_activity', p_user_id, p_client_request_id);
    select * into v_act from miles_activity where user_id = p_user_id and client_request_id = p_client_request_id;
    if found then
      return jsonb_build_object('activity', to_jsonb(v_act), 'replayed', true);
    end if;
  end if;

  perform private.miles_lock(p_user_id, 'krisflyer');
  v_available := private.miles_available(p_user_id, 'krisflyer', v_month);
  if v_miles > v_available then
    raise exception 'You only have % KrisFlyer miles available in that month', to_char(v_available, 'FM999,999,990');
  end if;

  insert into miles_activity (user_id, kind, program, activity_month, amount, miles, description, client_request_id)
    values (p_user_id, 'redeem', 'krisflyer', v_month, v_miles, v_miles, coalesce(p_description, ''), p_client_request_id)
    returning * into v_act;

  perform private.miles_take_oldest(p_user_id, 'krisflyer', v_month, v_miles, v_act.id);

  perform private.ledger_audit_append(p_user_id, 'miles.redeem', 'miles_activity', v_act.id,
    -v_miles, v_available - v_miles, p_client_request_id, '{}'::jsonb);

  return jsonb_build_object('activity', to_jsonb(v_act), 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo a conversion or redemption: put the points back on the lots they came
-- from. A conversion whose miles were since redeemed can't be undone first.
create or replace function public.miles_undo_activity(
  p_user_id uuid,
  p_activity_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_act miles_activity%rowtype;
  v_used numeric;
begin
  perform private.ledger_assert_caller(p_user_id);
  select * into v_act from miles_activity where id = p_activity_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Activity not found';
  end if;
  perform private.miles_lock(p_user_id, v_act.program);
  if v_act.kind = 'convert' then
    perform private.miles_lock(p_user_id, 'krisflyer');
  end if;

  if v_act.kind = 'convert' and v_act.created_lot_id is not null then
    select used into v_used from miles_lots where id = v_act.created_lot_id for update;
    if coalesce(v_used, 0) > 0 then
      raise exception 'Some of these miles went into a redemption. Undo that redemption first.';
    end if;
    delete from miles_lots where id = v_act.created_lot_id;
  end if;

  update miles_lots l
    set used = greatest(0, l.used - al.amount), updated_at = now()
    from miles_activity_lots al
    where al.activity_id = v_act.id and l.id = al.lot_id;

  delete from miles_activity where id = v_act.id;

  perform private.ledger_audit_append(p_user_id, 'miles.' || v_act.kind || '.undo', 'miles_activity', v_act.id,
    v_act.amount, null, null, jsonb_build_object('program', v_act.program));

  return jsonb_build_object('undone', v_act.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete a lot logged by mistake. Lots already drawn on, or created by a
-- conversion, are changed through Undo instead.
create or replace function public.miles_delete_lot(
  p_user_id uuid,
  p_lot_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_lot miles_lots%rowtype;
begin
  perform private.ledger_assert_caller(p_user_id);
  select * into v_lot from miles_lots where id = p_lot_id and user_id = p_user_id for update;
  if not found then
    raise exception 'Entry not found';
  end if;
  if v_lot.source = 'conversion' then
    raise exception 'These miles came from a conversion. Undo the conversion instead.';
  end if;
  if v_lot.used > 0 then
    raise exception 'Some of these points were already converted or redeemed. Undo that first.';
  end if;
  delete from miles_lots where id = v_lot.id;
  perform private.ledger_audit_append(p_user_id, 'miles.lot.delete', 'miles_lot', v_lot.id,
    -v_lot.amount, 0, null, jsonb_build_object('program', v_lot.program));
  return jsonb_build_object('deleted', v_lot.id);
end;
$$;

revoke all on function public.miles_add_lot(uuid, text, numeric, date, date, text, text) from public, anon;
revoke all on function public.miles_set_expiry_bucket(uuid, date, numeric) from public, anon;
revoke all on function public.miles_set_uob_balance(uuid, numeric, date) from public, anon;
revoke all on function public.miles_convert(uuid, text, date, numeric, text) from public, anon;
revoke all on function public.miles_redeem(uuid, date, numeric, text, text) from public, anon;
revoke all on function public.miles_undo_activity(uuid, uuid) from public, anon;
revoke all on function public.miles_delete_lot(uuid, uuid) from public, anon;
grant execute on function public.miles_add_lot(uuid, text, numeric, date, date, text, text) to authenticated, service_role;
grant execute on function public.miles_set_expiry_bucket(uuid, date, numeric) to authenticated, service_role;
grant execute on function public.miles_set_uob_balance(uuid, numeric, date) to authenticated, service_role;
grant execute on function public.miles_convert(uuid, text, date, numeric, text) to authenticated, service_role;
grant execute on function public.miles_redeem(uuid, date, numeric, text, text) to authenticated, service_role;
grant execute on function public.miles_undo_activity(uuid, uuid) to authenticated, service_role;
grant execute on function public.miles_delete_lot(uuid, uuid) to authenticated, service_role;
