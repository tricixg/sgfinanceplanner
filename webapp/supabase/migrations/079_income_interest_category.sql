-- 079: Built-in "Interest" income category.
-- Cash-account balance adjustments ticked as interest are recorded as deposits
-- in this category so they count as income (Past Cashflow interest chart).
-- New users get it from the app's default seed; this backfills existing users.

insert into income_categories (user_id, name, slug, sort_order, counts_in_baseline, counts_as_additive)
select distinct user_id, 'Interest', 'interest', 7, false, true
from income_categories
on conflict (user_id, slug) do nothing;
