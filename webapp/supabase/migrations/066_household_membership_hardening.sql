-- SEC-001: stop users from adding themselves to any household.
-- Run after 065_cpf_contribution_date.sql, in the Supabase SQL editor,
-- immediately BEFORE deploying the matching code. Idempotent: safe to re-run.
--
-- Before: policies on household_members let any signed-in user INSERT or UPDATE
-- their own membership row into any household_id (with check user_id = auth.uid()).
-- After:  clients can no longer write household_members directly. Membership is
-- created only by two SECURITY DEFINER functions:
--   * create_solo_household()          — the caller's own solo household
--   * accept_partner_invite(invite_id) — joins the household of a pending invite
--     addressed to the caller's email, atomically, and marks it accepted
-- and a trigger caps every household at 2 members.

-- 1. Remove the direct write policies (the delete-own-membership policy stays).
drop policy if exists "Users can insert own membership" on household_members;
drop policy if exists "Users can update own membership" on household_members;

-- 2. An invite can only be created for a household the inviter belongs to.
--    (Otherwise a user could invite themselves into someone else's household.)
drop policy if exists "Inviter can manage own invites" on partner_invites;
create policy "Inviter can manage own invites"
  on partner_invites for all
  using (inviter_id = auth.uid())
  with check (
    inviter_id = auth.uid()
    and public.is_household_member(household_id)
  );

-- 3. At most 2 members per household (also applies to service-role writes).
create or replace function public.enforce_household_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialise concurrent joins into the same household.
  perform pg_advisory_xact_lock(hashtext('household_members:' || new.household_id::text));
  if (
    select count(*) from public.household_members hm
    where hm.household_id = new.household_id and hm.user_id <> new.user_id
  ) >= 2 then
    raise exception 'household_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists household_members_limit on public.household_members;
create trigger household_members_limit
  before insert or update of household_id on public.household_members
  for each row execute function public.enforce_household_member_limit();

-- 4. Solo household for the signed-in user (replaces the client-side insert).
create or replace function public.create_solo_household()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
  mine uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select household_id into mine from public.household_members where user_id = uid limit 1;
  if mine is not null then
    return mine;
  end if;

  insert into public.households default values returning id into hid;
  insert into public.household_members (household_id, user_id, role)
    values (hid, uid, 'owner')
    on conflict do nothing;

  select household_id into mine from public.household_members where user_id = uid limit 1;
  if mine is distinct from hid then
    -- Lost a race with a concurrent call: drop the household we just made.
    delete from public.households where id = hid;
  end if;
  return mine;
end;
$$;

-- 5. Accept a pending partner invite: validate, move membership, mark accepted.
create or replace function public.accept_partner_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv public.partner_invites%rowtype;
  old_hid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if my_email = '' then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  select * into inv
  from public.partner_invites pi
  where pi.id = invite_id
    and pi.status = 'pending'
    and lower(pi.invitee_email) = my_email
  for update;

  if not found then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  -- The inviter must still belong to the household being joined.
  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = inv.household_id and hm.user_id = inv.inviter_id
  ) then
    raise exception 'invite_not_found' using errcode = 'P0001';
  end if;

  select household_id into old_hid from public.household_members where user_id = uid limit 1;

  if old_hid is distinct from inv.household_id then
    -- The trigger rejects the insert with 'household_full' if it already has 2 members.
    delete from public.household_members where user_id = uid;
    insert into public.household_members (household_id, user_id, role)
      values (inv.household_id, uid, 'member');
  end if;

  update public.partner_invites
    set status = 'accepted', responded_at = now()
    where id = inv.id;

  -- Invites the accepter had sent from their old household are now moot.
  update public.partner_invites
    set status = 'cancelled', responded_at = now()
    where inviter_id = uid and status = 'pending' and id <> inv.id;

  return inv.household_id;
end;
$$;

-- Only signed-in users may call the membership functions.
revoke all on function public.create_solo_household() from public, anon;
revoke all on function public.accept_partner_invite(uuid) from public, anon;
grant execute on function public.create_solo_household() to authenticated;
grant execute on function public.accept_partner_invite(uuid) to authenticated;
