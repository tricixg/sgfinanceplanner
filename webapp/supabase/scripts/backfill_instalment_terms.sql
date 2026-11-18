-- One-off backfill: principal, tenure and start month for active instalment plans.
-- NOT a migration (kept out of supabase/migrations on purpose). Safe to re-run.
--
-- Source of principal/tenure: the user's instalment statement table.
-- start_ym is derived, not typed in: the plan's last instalment month (end_ym)
-- minus (tenure - 1) months, i.e. the first instalment month. This agrees with
-- the statement's Paid/Left counts (e.g. IL 24M: ends 2027-10, 24 mo -> starts 2025-11).
--
-- Does NOT touch monthly, outstanding or end_ym.
-- Requires migration 077 (start_ym, principal, tenure_months).
-- Scoped to one user + exact plan names so nothing else is modified.

begin;

with terms(name, principal, tenure_months) as (
  values
    ('IL 24M — Instalment Loan',        2000.00, 24),
    ('PPP 004 — Preferred Payment Plan', 1009.65, 12),
    ('Trip.com',                          185.85,  6)
),
updated as (
  update loans l
     set principal     = t.principal,
         tenure_months = t.tenure_months,
         start_ym      = to_char(
                           to_date(l.end_ym || '-01', 'YYYY-MM-DD')
                             - ((t.tenure_months - 1) * interval '1 month'),
                           'YYYY-MM'),
         updated_at    = now()
    from terms t
   where l.name = t.name
     and l.user_id = '3e41bbe0-8c4e-4e1d-9070-6f6fc48299e9'
     and l.end_ym ~ '^\d{4}-\d{2}$'
  returning l.name
)
select count(*) as rows_updated from updated;  -- expect 3

commit;

-- Verify
select name, principal, tenure_months, start_ym, end_ym, monthly, outstanding
  from loans
 where user_id = '3e41bbe0-8c4e-4e1d-9070-6f6fc48299e9'
   and tenure_months is not null
 order by sort_order;
