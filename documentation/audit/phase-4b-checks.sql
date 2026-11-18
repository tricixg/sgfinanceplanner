-- Phase 4B read-only checks. Run in the Supabase SQL editor. Nothing here changes data
-- except the clearly marked, commented-out cleanup at the end.

-- 1) Accounts whose dashboard_state is still a full pre-v2 snapshot that has not been migrated.
--    Mirrors isValidDashboardState() in webapp/lib/validate-state.ts and the `_migrated_v2` check
--    in GET /api/state. 0 rows = the legacy migration code has nothing left to do.
select user_id, updated_at, pg_column_size(data) as bytes
from public.dashboard_state
where not coalesce((data ->> '_migrated_v2')::boolean, false)
  and (jsonb_typeof(data -> 'monthlySal') = 'number' or jsonb_typeof(data -> 'newSal') = 'number')
  and jsonb_typeof(data -> 'loans') = 'array'
  and jsonb_typeof(data -> 'goals') = 'array'
  and jsonb_typeof(data -> 'holdings') = 'array'
  and jsonb_typeof(data -> 'budget') = 'array'
  and (jsonb_typeof(data -> 'accounts') = 'array' or jsonb_typeof(data -> 'goals') = 'array')
  and (jsonb_typeof(data -> 'ilpPolicies') = 'array' or jsonb_typeof(data -> 'ilp') = 'number')
order by updated_at;

-- 1b) Context: how every dashboard_state row is classified.
select
  count(*)                                                        as total_rows,
  count(*) filter (where coalesce((data ->> '_migrated_v2')::boolean, false)) as migrated_v2,
  count(*) filter (where not coalesce((data ->> '_migrated_v2')::boolean, false)) as not_flagged
from public.dashboard_state;

-- 2) Households with no members (orphans), and whether anything still hangs off them.
--    Several tables reference households with ON DELETE CASCADE (partner_invites, savings_pools,
--    savings_goals, savings_transactions, household_bto_planner), so a memberless household that
--    still has rows could hold real shared data. Only the ones with zero children are safe to drop.
select h.id,
       h.created_at,
       (select count(*) from public.partner_invites x where x.household_id = h.id)       as invites,
       (select count(*) from public.savings_pools x where x.household_id = h.id)         as pools,
       (select count(*) from public.savings_goals x where x.household_id = h.id)         as goals,
       (select count(*) from public.savings_transactions x where x.household_id = h.id)  as transactions,
       (select count(*) from public.household_bto_planner x where x.household_id = h.id) as bto_plans
from public.households h
where not exists (select 1 from public.household_members m where m.household_id = h.id)
order by h.created_at;

-- 2b) Optional cleanup: ONLY memberless households with no child rows at all. Review (2) first,
--     then uncomment. Anything with a non-zero count above needs a human decision.
-- delete from public.households h
-- where not exists (select 1 from public.household_members m where m.household_id = h.id)
--   and not exists (select 1 from public.partner_invites x where x.household_id = h.id)
--   and not exists (select 1 from public.savings_pools x where x.household_id = h.id)
--   and not exists (select 1 from public.savings_goals x where x.household_id = h.id)
--   and not exists (select 1 from public.savings_transactions x where x.household_id = h.id)
--   and not exists (select 1 from public.household_bto_planner x where x.household_id = h.id);
