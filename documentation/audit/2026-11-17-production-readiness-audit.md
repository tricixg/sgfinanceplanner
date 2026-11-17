# Production Readiness & Performance Audit — sgfinanceplanner

**Date:** 2026-11-17 · **Commit audited:** `8694ea3` (main) · **Scope:** entire repository (`webapp/`, `documentation/`, CI, 65 migrations)
**Method:** static review of every layer + measurements from a local production build (`next build && next start`) running against an instrumented Supabase stand-in. No application code was changed.

---

## How measurements were taken (read this before trusting any number)

There is no access to the real Supabase project or real data from this environment, so:

* The app was built and run in production mode against a **local mock Supabase** (`perf-harness/mock-supabase.js`) that authenticates a fake user, returns **empty tables**, and injects a fixed latency on every call. It counts every DB/Auth round-trip.
* Pages were loaded in headless Chromium with **4× CPU throttling** (mid-range phone). Script: `perf-harness/pages.js`.
* Three latency scenarios were run: **30 ms** (app co-located with DB), **100 ms**, **230 ms** (≈ Vercel default region `iad1` ↔ a Singapore Supabase project — *your actual regions are unverified*, see PERF-001).
* Because tables were empty, **real-world numbers will be worse**: real payloads, real row counts, and the per-card/per-row loops below all add time. Treat these as a *lower bound* and as a reproducible **baseline** for before/after comparison.
* "DB time" below = number of *sequential* round-trips × latency; it was derived from the mock's call log, not from Postgres `EXPLAIN` (no DB access).

Baseline repo health (all green): **576 / 576 unit tests pass** (also under `TZ=UTC` and `TZ=America/Los_Angeles`), `eslint` clean, `tsc --noEmit` clean, `next build` succeeds.

---

# Executive Summary

| Dimension | Score | One-line reason |
|---|---:|---|
| **Overall production readiness** | **42 / 100** | Calculations are mostly sound and well tested, but several routine UI actions can silently destroy financial history, and there is no verified backup to recover from. |
| Correctness | 62 | Core formulas are right and tested; the same metric (net worth, monthly outflow) is computed differently on different screens; some totals silently truncate at 1,000 rows. |
| Security | 60 | RLS on all 54 tables, sound auth; but one RLS policy lets users join any household, open sign-up, a confirmed app-layer auth bypass (RLS still holds), and critical Next.js advisories on the installed version. |
| Reliability / data integrity | 30 | "Replace-the-whole-list" saves delete server rows and cascade into ledgers; balances are updated by non-atomic read-modify-write; load errors are swallowed and look like "$0". |
| Testing | 55 | Excellent unit coverage of pure math; **zero** tests on the write paths, API routes, RLS policies, or UI flows — exactly where the P0s live. |
| Maintainability | 58 | Clear layering and good docs; giant components (TabRecurring 57 KB, TabWealth 45 KB, TabBTO 44 KB), duplicated constants and helpers, documentation drift. |
| Performance | 45 | Every page is a client-rendered shell that performs a 3-stage request waterfall; load time is dominated by DB latency × sequential round-trips. 2.6–4.9 s to data at 230 ms latency even with empty tables. |

**Bottom line:** I would **not** yet trust this app as the system of record for important financial data. The math is in better shape than the plumbing. The three P0s are all "data silently disappears" problems with clear, contained fixes, and they should be fixed — and backups verified — before anything else.

### The 3 things that matter most

1. **P0 — Saving goals/pools on the Savings page destroys transaction history** (DATA-001). Every goal save deletes and re-inserts *all* goals; the DB then nulls `goal_id` on every linked transaction. Every pool save deletes *all* joint pools and the DB **cascades away the entire joint-pool ledger** (including your partner's entries).
2. **P0 — "Save the whole list" endpoints delete whatever the browser didn't send** (DATA-002). Cards, loans, holdings and cash accounts. A single failed page load (or using *Reset* / *Load dummy data* on the Me page) followed by a normal edit deletes every card **and all of its statements and payment records**, or every cash account **and its full transaction history**.
3. **P0 — No verified backup / restore path** (BKP-001). The in-app "Export JSON" backup omits expenses, accounts, goals, transactions, statements, CPF ledgers, travel and poker, and "Import" doesn't persist anything.

### Biggest performance levers (measured)

* **Co-locate compute and DB** (PERF-001): same pages go from **2.6–4.9 s → 0.85–1.9 s** when DB latency drops from 230 ms to 30 ms. Likely a one-line `vercel.json` change — but verify regions first.
* **Stop authenticating every link prefetch** (PERF-002): one dashboard load makes **76 Supabase Auth calls** (58 are from background RSC prefetches).
* **Collapse the 3-stage waterfall** (PERF-003): session check → 12 "core" APIs on *every* page → page-specific APIs only after core finishes.

---

# Architecture Overview

```
Browser (all pages are "use client" static shells)
  └─ app/(app)/layout.tsx
       RequireAuth ── GET /api/auth/session  (blocks render)
       AppSessionProvider
       AppDataProvider ── 9 providers, all in one component
           useAppDataProvider  → 12 parallel GETs (state, profile, loans, other-loans, budget-lines,
                                  credit-cards, holdings, portfolio/NW snapshots, CPF ×2)
           useSavings/Accounts/Funds/Miles/Household/FinancialAccounts/Benefits/OutstandingStatements
             (lazy — fire when a page first calls them)
       AppShell → components/app/pages/*Route.tsx → components/tabs/Tab*.tsx
              DomainPage gates every page on coreLoading; pages then fetch their own data

Next.js Route Handlers (app/api/**, ~115 routes)
  requireSessionUser()  ← identity forwarded by middleware in x-sgfp-verified-user
  createAuthedSupabaseClient() → user-JWT PostgREST client (RLS enforced)
  lib/* domain modules: queries + business rules + multi-step writes (no DB transactions)
  Service-role client only in: partner unlink, partner-cpf, partner-bto-payments, invite emails, Telegram bot

Supabase
  Auth (magic link, open sign-up) · Postgres 54 tables, RLS on all · no triggers, no RPC functions
  Balances (accounts, pools, goals, funds, CPF OA/SA/MA, loan outstanding) are denormalised columns
  maintained by application code

External: Yahoo Finance (quotes), Frankfurter (FX), Telegram Bot API, Vercel Analytics + Speed Insights
Deploy: Vercel (no region pinned), migrations pasted manually into the Supabase SQL editor
CI: GitHub Actions — npm ci, lint, vitest (TZ=Asia/Singapore), next build
```

**Model vs. reality.** The documented model (`User → UI → hooks → API → lib → Postgres`) matches the code, with three important deviations:

1. **The browser can talk to Postgres directly.** The anon key is public and the Supabase session cookie is JS-readable (the `@supabase/ssr` default). Any signed-in user can call PostgREST directly and skip every API-route validation. **RLS and DB constraints are the real security boundary, not the API.**
2. **The API is not the unit of atomicity.** Multi-step writes such as "insert transaction + update balance + update goal" are separate HTTP calls to PostgREST, with best-effort manual compensation.
3. **Some derived history is written by the browser.** For example, the monthly net-worth snapshot is computed from whatever the client has loaded at the time.

### Source of truth per metric

| Metric | Ultimate source | Computed in | Consistent? |
|---|---|---|---|
| Cash (per account) | `user_savings_accounts.balance` (denormalised; ledger is *not* replayable because opening balances aren't ledger rows) | API read | ⚠ can drift from ledger (DATA-003) |
| CPF OA/SA/MA | `user_finance_profile.oa/sa/ma`, adjusted by contribution & CPF-transaction writes, *and* directly overwritable on CPF tab | `lib/cpf/*` | ⚠ clamped at 0 → non-reversible (DATA-003) |
| Net worth (Wealth / Cash Accounts) | `wealthSummary()` — holdings + ILP + funds + cash − (margin + instalment + personal + BT + card balances) | `lib/finance/wealth.ts` | ✅ |
| Net worth (Year projection "Now") | `simulate5y()` — CPF + ILP + holdings + cash − (instalment + margin) | `lib/finance/projection.ts` | ❌ different formula (FIN-001) |
| Net worth history | `net_worth_snapshots`, written by a client effect on Cash Accounts page | `TabCashAccounts.tsx:124` | ⚠ can record partial-load values (DATA-005) |
| Monthly take-home | gross − employee CPF (no income tax) | `lib/finance/income.ts` | ⚠ assumption not shown (FIN-003) |
| Monthly debt load | instalment loans active in month + all unpaid personal loans | `lib/finance/loanLoad.ts` | ⚠ projection ignores personal loans (FIN-001) |
| Card statement outstanding | `card_statements` + tracked spend from `expenses`/`budget_transactions` | `lib/credit-cards/card-statements/*` | ⚠ spend query truncates at 1000 rows (DATA-004) |
| Salary for a past month | `budget_months.monthly_salary` snapshot (063) | `lib/budget/monthly.ts` | ✅ history preserved |
| Insurance/ILP/subscription/loan lines for a past month | *current* settings | `lib/finance/*` | ⚠ history rewritten when settings change (FIN-005) |

---

# Critical Findings (P0 / P1)

### DATA-001 — P0 — Data integrity — Savings goals/pools are deleted and recreated on every save
**Location:** `webapp/app/api/savings/route.ts:72-122` (called from `components/tabs/TabSavings.tsx:88-115` via `hooks/useSavings.ts:108-140`)

**Problem:** `PUT /api/savings`:
* `pools`: `delete … where household_id = <yours>`, then inserts the client's list.
* `goals`: deletes *all* your individual goals **and all shared household goals**, then inserts the client's list.

Inserts create new UUIDs. Schema effects:
* `savings_transactions.pool_id … on delete cascade` (`004_accounts_ledger.sql:15`) → **every joint-pool transaction for the household is deleted**, and pool balances are reset to whatever the client sent.
* `savings_transactions.goal_id … on delete set null` (`004:16`), `fund_transactions.goal_id … set null` (`040:22`) → every goal's transaction history is detached. Goal transaction lists query `.eq("goal_id", goalId)` (`lib/savings/ledger.ts:565`), so they show empty.
* Not atomic: if the insert fails after the delete, **all goals/pools are gone**.
* Last-writer-wins across partners: a partner saving a stale list overwrites your shared goals.

**Why it matters:** routine edits (renaming a goal, changing a target) permanently destroy history, silently.

**Reproduce:** Savings → Edit your goals → change a name → Save → open any goal's transaction history → empty. For pools: add a pool transaction → Edit pools → Save → the transaction is gone from history.

**Fix:** make goals/pools diff-based upserts keyed by `id`. Update existing rows in place; insert only rows without an id; delete only ids the user explicitly removed, ideally via a dedicated `DELETE /api/savings/goals/:id` with confirmation. Never send or overwrite `balance`/`saved_amount` from the edit form; those are ledger-derived. Consider `on delete restrict` for `savings_transactions.pool_id`.

**Risk of fixing:** low–medium (API contract stays the same shape). **Regression test:** yes — "save goals preserves ids and goal_id links"; "save pools never deletes transactions".

---

### DATA-002 — P0 — Data integrity — "Replace-all" saves delete rows the client didn't send; deletes cascade into ledgers
**Locations:**
* Cards: `lib/credit-cards/load.ts:44-52` → `card_statements … on delete cascade` (`017:9`), which takes statement payment links and interest history with it.
* Cash accounts: `app/api/accounts/route.ts:59-64` → `savings_transactions.account_id … on delete cascade` (`004:14`).
* Holdings: `lib/holdings/load.ts:78-82`. Matched by **ticker**, so editing a ticker deletes the row → `holding_dividends … on delete cascade` (`044:7`).
* Loans: `lib/loans/load.ts:34,74-78`. Also silently drops any loan whose `monthly` is 0 (`filter(l => l.monthly > 0)`).
* Client side: `hooks/useAppData.ts:204-240` swallows load failures (`if (cardsRes.res.ok) setCreditCards(...)`, `catch → console.warn`), leaving `[]` in state.

**Problem:** the browser sends its whole in-memory list and the server deletes everything not in it. That list can be wrong in several ordinary ways:
1. A transient failure of `/api/credit-cards` on page load leaves the list empty, and the UI shows "no cards".
2. Me page → **Reset all to zero** (no confirmation, `TabMe.tsx:603`), **Load dummy data**, or **Import JSON** replace the in-memory state (MeRoute only flashes "Salary saved").
3. A second tab or device added a card after this tab loaded.

The next ordinary "Edit → Save" on Cards, Debt or Wealth then persists that list. The server deletes every real row and the DB cascades.

**Reproduce (cards):** DevTools → block `/api/credit-cards` → reload `/cards` → Edit → add one card → Save → unblock and reload. All previous cards and every statement are gone.

**Fix:**
* Replace list PUTs with per-row create/update/delete endpoints, or at minimum require an explicit `deletedIds` list. Never infer deletion from absence.
* Make load failures visible: render an error state and **disable editing** when a domain failed to load.
* Change destructive FKs (`card_statements.credit_card_id`, `savings_transactions.account_id`, `holding_dividends.holding_id`) to `restrict` or soft-delete (`archived_at`).
* Remove or rework Me-page Reset / Dummy / Import (UX-001).

**Risk of fixing:** medium (touches 4 save paths and their UIs). **Regression tests:** yes — server-side tests that an omitted id is *not* deleted; UI test that edit is disabled after a failed load.

---

### BKP-001 — P0 — Recovery — No verified backups; the in-app "backup" is incomplete and "restore" is a no-op
**Location:** `components/tabs/TabMe.tsx:220-255`, `hooks/useAppData.ts:82-83`; docs `documentation/user-guide/pages.md:300-304`

**Problem:**
* "Export JSON" serialises the in-memory `DashboardState`, which deliberately has `accounts: []`, `goals: []` and contains no expenses, ledger transactions, card statements, CPF contributions/transactions, travel, poker, benefits, on-call or miles data.
* "Import JSON" only calls `setState`; nothing is written to the server.
* The user guide tells users to "export backup before big changes".
* I found no evidence of Supabase backup configuration or a tested restore. Free-tier projects have no downloadable backups or PITR, and the repo can't tell which plan you're on.

**Why it matters:** with DATA-001/002/003 live, recovery currently depends entirely on Supabase's platform backups, which are unverified.

**Fix:**
1. **Today:** confirm your Supabase plan's backup retention, take a manual `pg_dump` (Supabase CLI `supabase db dump --data-only`), and store it off-platform.
2. Enable PITR if the plan allows it.
3. Replace "Export JSON" with a server-side full export (all user tables), or relabel it honestly.
4. Do a restore drill into a scratch project.

**Risk:** none. **Test:** restore drill.

---

### SEC-001 — P1 — Authorization — Any user can add themselves to any household
**Location:** `webapp/supabase/migrations/003_couples_and_ledger.sql:168-176` (`"Users can insert own membership"` / `"Users can update own membership"`: `with check (user_id = auth.uid())`)

**Problem:** the policies only check that the row is *yours*, not that you were invited. A signed-in user who knows a `household_id` can `insert into household_members (household_id, user_id)` directly via PostgREST, or `update` their own row to point at it. After that, `is_household_member()` is true. They can then read and write joint pools, shared goals and pool transactions, and the service-role routes `/api/household/partner-cpf` and `/partner-bto-payments` will serve them a member's CPF and BTO data. There is no size cap, so a third member can join silently.

**How a household_id leaks:** `partner_invites` select policy lets the **invitee** read the invite row, including `household_id` (`003:189-194`). Anyone you have ever invited, including someone who declined or was cancelled, can join. Sign-up is open (SEC-004).

**Fix:** drop the insert/update policies on `household_members`. Do the join inside a `security definer` function `accept_partner_invite(invite_id)` that verifies a pending invite for `auth.jwt()->>'email'`, then inserts the membership and marks the invite accepted in one transaction. Add a trigger or constraint limiting households to 2 members.

**Risk:** low (the accept flow already exists; move it into SQL). **Regression test:** yes — RLS test via `supabase test db` / pgTAP: "non-invited user insert into household_members fails".

---

### SEC-002 — P1 — Dependencies — Installed Next.js has critical advisories
**Location:** `webapp/package.json` (`next 16.2.12`)

`npm audit --omit=dev` reports 1 critical, 4 high, 1 moderate. `next <16.4.1` carries multiple *critical* RCE advisories (Image Optimization API with SVG/AVIF, `next/og`, `use cache`), a high SSRF in image optimization, and cache-poisoning issues. Also affected: `sharp` (libvips/libheif), `postcss`, `source-map-js`, `nanoid`, `baseline-browser-mapping`.

**Actual exposure:** low on Vercel. The app uses none of `next/image`, `next/og`, `use cache` or server actions, and Vercel runs image optimization in its own service. The fix is still a patch-line bump within v16.

**Fix:** upgrade `next` + `eslint-config-next` to ≥ 16.4.6 and run `npm audit fix` for the transitive packages, then the full CI suite. **Risk:** low–medium (read the 16.3/16.4 notes; `middleware.ts` is deprecated in favour of `proxy.ts`).

---

### SEC-003 — P1 — Authentication — Forged identity header reaches route handlers when middleware is skipped (confirmed)
**Location:** `webapp/middleware.ts:9-11` (matcher excludes any path ending `.svg|png|jpg|jpeg|gif|webp`), `lib/auth/require-user.ts:47-51` (trusts `x-sgfp-verified-user`)

**Problem:** for `/api/expenses/abc.png` the matcher skips middleware, but Next still routes it to `/api/expenses/[id]`. `requireSessionUser()` then trusts a client-supplied header.

**Verified locally:**

| Request (forged header, no cookie) | Response |
|---|---|
| `DELETE /api/expenses/abc` | `401 Sign in required` |
| `DELETE /api/expenses/abc.png` | `Not found` — passed authentication with the forged user id |

**Why only P1:** the DB client in these routes still uses the request's (absent) user JWT, so RLS returns or modifies nothing. Every service-role route is a static path. But application-level auth is bypassed. Any future dynamic route that uses the service-role client, or trusts `user.id` for anything non-RLS (logs, rate limits, Telegram), becomes a full bypass.

**Fix (one of):**
* Sign the header with an HMAC using a server-only secret.
* Have middleware also set a secret nonce header, and reject in `requireSessionUser` when it's absent.
* Stop excluding `/api/**` from the matcher.

**Risk:** low. **Regression test:** yes (route-level test with forged header).

---

### DATA-003 — P1 — Data integrity — Balances updated by non-atomic read-modify-write across several HTTP calls
**Locations:**
* `lib/savings/ledger.ts:600-660` (delete transaction: update balance → update goal → delete row)
* `lib/expenses/ledger-sync.ts:118-150`
* `lib/funds/ledger.ts:60-80,160-190`
* `lib/cpf/contributions.ts:84-91,119-123,175-180` (OA/SA/MA += delta via load-then-save, clamped with `Math.max(0, …)`)
* `app/api/expenses/route.ts:239-290` (insert expense → adjust loan/BNPL/fund → ledger sync; compensating deletes not error-checked)

There are no Postgres functions, triggers or transactions in the schema.

**Problem:**
* **Lost updates:** two concurrent writes read the same balance (double-click, two tabs, partner + you on a pool).
* **Partial writes:** a failure between steps leaves the balance changed but the row not deleted. A retry then double-reverses.
* **Non-invertible CPF:** adding then deleting a contribution doesn't return to the original balance if the clamp kicked in.
* **No idempotency:** a retried POST creates a second expense *and* a second withdrawal.

**Fix:** move each ledger operation into a single `plpgsql` function called via `supabase.rpc(...)`. Use `update … set balance = balance + $delta` (atomic) with `check (balance >= 0)` where intended, and the row insert/delete in the same transaction. Accept an idempotency key (unique column) on create endpoints.

**Risk:** medium–high (core write paths); do it incrementally behind the existing lib function signatures. **Tests:** yes — concurrency test (N parallel deposits → balance = sum), failure-injection test.

---

### DATA-004 — P1 — Financial correctness — Aggregations silently truncate at PostgREST's 1,000-row limit
**Locations:** `lib/cards/statement-spend-index.ts:78-110` (card spend since the earliest statement ever, no `order`, no `range`), `lib/cards/statement-spend.ts:41-60`, `app/api/spending/analytics/route.ts:54-70`, `app/api/expenses/summary/route.ts:49-60`, `app/api/income/analytics/route.ts:41`, `lib/income/deposits-by-month.ts:71`

**Problem:** Supabase returns at most 1,000 rows per request by default (`max_rows`), with no error. The card spend index loads every card-paid expense since the first statement's cycle start. After roughly 1,000 card transactions (about a year), tracked spend, interest estimates and statement outstanding are computed from an **arbitrary subset** of rows. 6-month analytics break at ~5.5 transactions/day. The schema doc already notes this limit for `budget_line_months` (see `05-database-schema.md`, "Known limit").

**Fix:** aggregate in SQL (a view or RPC with `sum(...) group by day, account`) or bound the window to the cycles actually being displayed. As a stop-gap, paginate with `.range()` in a loop and order deterministically.

**Risk:** low–medium. **Test:** yes — loader test with >1000 mocked rows.

---

### FIN-001 — P1 — Financial correctness — Net worth and monthly outflow are computed differently on different screens
**Locations:** `lib/finance/projection.ts:43-60,96-104` vs `lib/finance/wealth.ts:170-195`, `lib/finance/budget.ts:200-215`

| Item | Wealth / Cash Accounts NW | Year projection (`simulate5y`) |
|---|---|---|
| Investment funds | included | **excluded** |
| Personal loans | deducted | **ignored** (balance and monthly repayment) |
| Balance-transfer loans | deducted | **ignored** |
| Card balances | deducted | **ignored** |
| Insurance premiums (monthly outflow) | in Budget verdict | **not deducted from projected cash** |

So the Year page's "Now" net worth doesn't match the Wealth page's net worth, and every projected year overstates cash by (insurance + personal-loan repayments) × months.

**Fix:** seed the projection from `wealthSummary()`. Deduct `computedInsuranceMonthly`, `otherLoanMonthlyLoad`, and amortise `otherLoans` balances. Add a test asserting `simulate5y(...)[0].nw === netWorthTotal(...)`.

**Risk:** low (pure functions, tested). **Test:** yes.

---

### PERF-001 — P1 — Performance — Compute region not pinned; load time is latency-bound
**Location:** `webapp/vercel.json` (no `regions`)

Vercel's default function region is `iad1` (Washington, D.C.). If your Supabase project is in `ap-southeast-1` (Singapore), the likely choice for an SG app, every DB/Auth round-trip crosses the Pacific (~200–250 ms).

**Measured (empty data, 4× CPU):** time until the last API on the page finishes —

| Scenario | Fastest page | Slowest page | Median |
|---|---:|---:|---:|
| 230 ms per DB call | 2.57 s (/cpf) | 4.86 s (/budget) | 3.1 s |
| 30 ms per DB call | 0.85 s (/benefits) | 1.93 s (/cash-accounts) | 1.1 s |

**Fix:** check Supabase → Settings → General (region), then set `"regions": ["sin1"]` (or the region matching the DB) in `vercel.json`.
**Expected improvement:** ~2–3 s per page if the regions currently differ.
**Measure:** Vercel Speed Insights before/after, plus `perf-harness/pages.js` against prod.
**Risk:** very low.

### PERF-002 — P1 — Performance — Middleware calls Supabase Auth on every request, including ~58 link prefetches per page
**Location:** `lib/supabase/middleware.ts:31-33`, matcher in `middleware.ts`, sidebar/tab `Link`s

**Measured:** one `/dashboard` load = **76** `GET /auth/v1/user` calls (18 for API calls + 58 for RSC prefetches of nav routes). That's 127 Supabase calls in total for a page that shows *empty* data.

**Effects:** every HTML document, prefetch and API call waits one Auth round-trip before doing anything. It also adds function invocations and Auth load.

**Fix:**
* Skip auth in middleware for `?_rsc` prefetches and static page documents. Pages are client-gated, and the APIs enforce auth themselves.
* And/or switch to `supabase.auth.getClaims()` with asymmetric JWT signing keys (local verification, no network).
* Set `prefetch={false}` on nav links. Every page is a static shell, so prefetch buys almost nothing.

**Expected:** −1 Auth RTT on every API call and −58 background requests per page. **Risk:** low.

### PERF-003 — P1 — Performance — Three-stage waterfall on every page; "core" data fetched even when the page doesn't need it
**Locations:** `components/RequireAuth.tsx`, `hooks/useAppData.ts:175-245`, `components/app/DomainPage.tsx`, `components/app/pages/*Route.tsx`

Stages (dashboard at 230 ms):
* `/api/auth/session` ends at ~0.8 s.
* 12 core APIs run in parallel, ending ~2.2 s. `/api/state` alone does 5 sequential DB calls.
* Page-specific APIs start only after core completes, e.g. `/year`, `/wealth`, `/cash-accounts`, `/financial-health`, `/budget` then fetch `/api/savings` (8 sequential calls), ending at 4.5–4.9 s.

The Expenses page waits for holdings, CPF and portfolio snapshots it never uses.

**Fix:**
* Remove the blocking client session check (redirect unauthenticated users in middleware/proxy instead, or start data fetches in parallel with it).
* Let each page declare the domains it needs.
* Never gate page-specific fetches on unrelated core data.
* Render critical content first and skeletons for the rest.

**Expected:** −1 to −2 waterfall stages ≈ −0.5 to −1.5 s at 230 ms. **Risk:** medium (touches the shell).

### REL-001 — P1 — Reliability — Failed loads look like real zeros; no fetch timeouts; some save failures are invisible
**Locations:** `hooks/useAppData.ts:225-240`, `lib/fetch-json.ts:36-43` (no `AbortController`), `components/tabs/TabCPF.tsx:44-58` (save failure only `console.error`)

A failed `/api/holdings` makes net worth drop by your whole portfolio with no indication. A hung request leaves "Loading…" forever. This is also the trigger for DATA-002.
**Fix:** per-domain `error` state surfaced in the UI ("Couldn't load cards — retry"), 15 s timeouts, and a snackbar on every failed save. **Risk:** low.

### UX-001 — P1 — UX reliability — Me page "Reset all to zero" / "Load dummy data" / "Import JSON" are in-memory only, yet say "saved"
**Location:** `components/tabs/TabMe.tsx:228-255,603`, `components/app/pages/MeRoute.tsx:33-50`

There is no confirmation on Reset. All three flash "Salary saved" but persist nothing, so a reload restores the old data. Meanwhile they prime DATA-002 for the next save on another page.
**Fix:** remove them for signed-in users, or turn them into explicit, confirmed server operations. **Risk:** low.

---

# Financial Calculation Audit

| Calculation | Location | Implementation | Expected | Correct? | Risk |
|---|---|---|---|---|---|
| CPF total contribution | `lib/finance/cpf.ts:9-12` | `min(w, 8000) × (0.20 + 0.17)` | 37% of OW capped at OW ceiling ($8,000 from Jan 2026) for age ≤ 55 | ✅ for age ≤ 55, 2026 | Hardcoded age band; no AW/bonus; no low-wage (<$750) rates; no rounding to CPF's dollar rules |
| CPF allocation | `cpf.ts:5-7` | OA 0.6217 / SA 0.1621 / MA 0.2162 | Age ≤ 35 ratios (23/6/8 of 37) | ✅ for ≤ 35 only | Wrong for users > 35 (FIN-003) |
| Employee CPF / take-home | `income.ts` | gross − 20% × min(gross, 8000) | Same (income tax is annual, not withheld) | ✅ formula; ⚠ income tax ignored | "Remaining" overstated (FIN-003) |
| CPF interest projection | `projection.ts:73-79,127-133,158-164` | add contribution, then compound monthly at 2.5% / 4% | CPF computes monthly on lowest balance, credits annually; contribution for month M earns from M+1; +1% extra interest on first $60k | ⚠ approximation (small overestimate from timing, underestimate from missing extra interest) | Rates duplicated in 4 places; assumptions not shown |
| Salary growth | `projection.ts:107-110` | `round(sal × (1+g))` each December | Annual step | ✅ (assumption) | — |
| 5-year cash projection | `projection.ts:96-104` | take-home − fixed − spend − instalments − invest − margin pay | Should also deduct insurance + personal-loan repayments | ❌ | FIN-001 |
| Projection net worth | `projection.ts:55-60` | CPF + ILP + holdings + cash − instalments − margin | Same composition as `wealthSummary` | ❌ | FIN-001 |
| Margin loan in projection | `projection.ts:90-95` | 4.8% p.a. monthly, $300/month repayment | User-configurable | ⚠ magic numbers | P3 |
| Liquid net worth | `wealth.ts:170-195` | investments + cash − liabilities (BT netted against card balance) | Same | ✅ | BT/card netting is subtle but documented and tested |
| Debt burn-down chart | `debt.ts:96-119` | months **2026-06 → 2027-12 hardcoded**, starting from *today's* balances | Start at current month, run to last loan end | ❌ | Mislabelled by 5 months and cut off after Dec 2027 (FIN-002) |
| Active loan outstanding | `debt.ts:50-56` | sum `out` where `end ≥ now` | Same | ✅ | — |
| Loan load for month | `loanLoad.ts` | instalments with `end ≥ ym` + **all** unpaid personal loans regardless of month | Respect start/paid dates | ⚠ no start date → past months overstated | FIN-005 |
| Card daily interest | `cards/interest-accrual.ts:21-45` | daily rate APR/365, **compounded daily**, from day after due on principal at due | SG cards typically charge on the full balance from posting date when not paid in full, compounded monthly | ⚠ **unverified assumption** — likely *under*estimates when not paid in full | Confirm intended model before changing (rule 31) |
| Statement outstanding / carry-in | `interest-accrual.ts:57-130`, `card-statements/pay.ts`, `load.ts` | `carry + actual + interest − paid`, with `statementCarryIn` avoiding double-count when the amount is a bank total | Same | ✅ consistent at all call sites | Well tested |
| Card tracked spend | `cards/statement-spend-index.ts` | Sum of expenses + budget txns per day | Same | ❌ beyond 1000 rows | DATA-004 |
| Bank loan capacity (BTO) | `bto-bank-loan.ts:20-55` | annuity PV at 4% stress, MSR 30%, TDSR 55%, 30y cap | MAS/HDB rules 2026 | ✅ formula | Grant tables in `bto-schemes.ts` not independently verified against current HDB figures |
| Annuity PV | `bto-bank-loan.ts:20-25` | `P(1−(1+r)^−n)/r`, r = 0 handled | Same | ✅ | — |
| Savings goal monthly | `budget.ts:113-133` | sum active goals; shared = my split or 50% | Same | ✅ | — |
| Money rounding | `roundMoney` ×2 copies (`cards/interest-accrual.ts:48`, `travel/split.ts:6`) | `Math.round(n×100)/100` | Single helper; round at write boundary | ⚠ duplicated; `0.285` → 0.28 (FP) edge | P3 |

**Money representation.**
* JS `number` (float64) everywhere in memory and on the wire.
* Postgres: `numeric(14,2)` for ledger balances and amounts (migration 056, added *because* of `474.79999999999995` "Insufficient balance" failures), but **unconstrained `numeric`** for `expenses.amount`, statement amounts, `loans.outstanding`, profile CPF/cash, etc.
* `0.1 + 0.2` artefacts are mostly absorbed by `roundMoney` and the numeric(14,2) columns. The residual risk is inconsistent precision between tables and rounding in two places.
* **Recommendation:** keep `number` in JS (values are well inside 2^53 cents). Make *every* money column `numeric(14,2)` with sensible `check` constraints, and use one shared `roundMoney` applied at the API write boundary. Integer cents isn't worth the migration churn here.

**Date/time.** Strong overall:
* `lib/time/sgt.ts` is used consistently for "today" and month keys (server runs in UTC).
* Date-only values are stored as `date`/`YYYY-MM-DD` strings.
* Tests pass under SGT, UTC and LA.
* `2026-08-01` entered in forms stays `2026-08-01`.

Two exceptions:
* `lib/budget/parse-csv.ts:109-116` converts non-ISO dates with `new Date(s).toISOString()`. Verified: in SGT, `"Aug 1, 2026"`, `"8/1/2026"` and `"2026/08/01"` all become **`2026-07-31`**. It's currently dead code (only its test imports it), but it's a trap for whoever wires up CSV import.
* `debt.ts:37` / `formatMonthLabel` parse `YYYY-MM-01` as UTC and display in local time. That's fine in SG and would show the previous month in negative-offset timezones (P4).

---

# Security Audit

| Area | Status | Notes |
|---|---|---|
| Authentication | ✅ mostly | Supabase magic link, `exchangeCodeForSession`, safe relative redirect (`safe-redirect.ts`, tested). Optional password. Session refresh in middleware. |
| Sign-up | ⚠ SEC-004 (P2) | `shouldCreateUser: true` (`MagicLinkAuth.tsx:37`) — anyone can create an account in a personal app: quota use, Telegram linking, and the precondition for SEC-001. Disable sign-ups in Supabase Auth settings or add an allowlist. |
| Authorization (IDOR/BOLA) | ✅ except SEC-001 | All 54 tables have RLS; owner policies use `auth.uid()`. API handlers additionally filter by `user_id`. Dynamic `[id]` routes rely on RLS — verified pattern. Service-role usage is limited to 5 static paths and scoped by membership. |
| Household / partner | ❌ SEC-001 (P1) | See above. |
| Identity forwarding | ❌ SEC-003 (P1) | Confirmed bypass of app-layer auth. |
| Direct PostgREST access | ⚠ DATA-008 (P2) | API validation is bypassable; DB constraints are thin (few `check`s on amounts/balances). A partner can write any value into shared pools/goals. |
| SQL/NoSQL injection | ✅ | All queries via the PostgREST builder; no raw SQL or `rpc` with string concatenation. |
| XSS | ✅ | No `dangerouslySetInnerHTML`. One `innerHTML` (`PokerStatsTrends.tsx:74`) interpolates only formatted numbers and dates. **No CSP**, and auth cookies are JS-readable, so any future XSS = session theft (SEC-005, P3). |
| CSRF | ✅ acceptable | JSON bodies + `SameSite=Lax` cookies; no state-changing GETs reachable cross-site with effect (but GETs do write — DATA-006). |
| SSRF | ✅ | Quotes: fixed Yahoo host, `encodeURIComponent(symbol)`, auth + per-user rate limit. FX: fixed Frankfurter host. |
| File upload | ✅ | Poker CSV: size cap, parsed as text. |
| Telegram | ✅ | Webhook secret header check (non-constant-time compare; negligible risk); link codes 6 chars × 32 symbols (~1e9), 10-min TTL, per-chat rate limit. Link codes are written to logs (`links.ts:42`) — remove. |
| Secrets | ✅ | No secrets in repo or history checked (`.env*` git-ignored); service-role key server-only; dev bypass hard-disabled when `NODE_ENV=production`. |
| Dependencies | ❌ SEC-002 (P1) | See above. Unused deps: none significant. `chartjs-adapter-date-fns` + `date-fns` used by one chart only (PERF-005). |
| Error exposure | ⚠ P3 | Raw Postgres/PostgREST `error.message` returned to clients in most routes. |
| Security headers | ⚠ P3 | `X-Frame-Options`, `nosniff`, `Referrer-Policy` set; no CSP, no `Permissions-Policy`. |

---

# Data Integrity Audit

* **Constraints:** 111 `check` constraints exist, but few protect money. For example, `loans.outstanding`, `user_savings_accounts.balance` (no `>= 0`), and `expenses.amount` (no `> 0` at DB level; the API checks) are unprotected. Good uniqueness: `card_statements (card, close_date)`, `income_categories (user, slug)`, `cpf_contributions (user, month)`, `budget_line_months`.
* **Destructive cascades** (combined with DATA-001/002): `card_statements ← credit_cards`, `savings_transactions ← user_savings_accounts / savings_pools`, `holding_dividends ← holdings`, `fund_transactions ← investment_funds`, `travel splits ← expenses`. Recommend `restrict` + soft-delete for anything with financial history.
* **Atomicity:** none at DB level (DATA-003).
* **GETs that write (DATA-006, P2):**
  * `/api/credit-cards/statements` inserts and updates statement rows on read, per card, sequentially. Concurrent loads race the unique index → occasional 500.
  * `/api/state` runs household bootstrap + legacy migration on GET.
  * `loadIncomeCategories` seeds on empty and **recurses without bound** if the insert succeeds but the select returns nothing (reproduced as an infinite loop in the test harness, 400+ DB calls in 15 s).
  * Household bootstrap's orphan cleanup needs a `households` delete policy that doesn't exist, so it silently no-ops.
* **Concurrency:** last-writer-wins everywhere (no `updated_at` precondition / ETag). Notable for shared goals/pools edited by two partners.
* **History preservation:**
  * Expenses, ledgers and statements are immutable records, and salary is snapshotted per month (063). **Salary changing from $6,500 → $7,000 does not rewrite past months.** ✅
  * Insurance, ILP, subscription and instalment lines for past months are recomputed from *current* settings, so changing a premium or deleting a loan silently alters past monthly budgets (FIN-005, P2).
* **Net-worth history (DATA-005, P2):** written by a browser effect 800 ms after values settle (`TabCashAccounts.tsx:123-133`). Card statements load separately and can take longer, so the first write can omit card liabilities. Concurrent POSTs can land out of order, and a failed domain load writes a wrong figure for the month. Compute server-side or only write when every input has loaded successfully.
* **Migrations (OPS-001, P2):**
  * Applied manually in the SQL editor with no tracking table, no down scripts, and "run SQL immediately before deploying code" coupling.
  * Docs list 001–025 while 065 exist.
  * *If deployment succeeds but a migration failed:* code that selects a missing column 500s on that domain.
  * *If code is rolled back after a migration:* mostly safe (migrations are additive, `budget_lines.amount` kept for 063 rollback), but nothing enforces that.

---

# Performance Audit

### Overall assessment
Every route is a **statically prerendered client shell**. All data is fetched from the browser after JS hydrates and a session check completes. Rendering itself is not the bottleneck: FCP is 0.12–0.37 s for every page. What dominates is **(sequential stages) × (API latency) × (sequential DB calls inside each API)**, plus an Auth round-trip in middleware before every request.

### Page-by-page performance scorecard
Columns:
* **Data ready** = time until the last API response on the page, at 230 / 100 / 30 ms per DB call.
* **Requests** = all network requests on first load (≈58 of them are background RSC prefetches).
* **Initial JS** = gzipped JS referenced by the page's HTML. **Payload** = total transferred, including prefetched route JS.
* **Score** = 100 − (data-ready@230 ms − 1 s)/50 ms, −5 if initial JS > 280 KB.
* DB time per API is in the endpoint table below. Render time ≈ FCP, since all content is client-rendered.

| Page | Score | FCP | Data ready @230 / 100 / 30 ms | API reqs | Requests | Initial JS (gz) | Payload | Main bottleneck |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| /budget | 18 | 376 ms | 4.86 / 2.63 / 1.52 s | 18 | 129 | 301 KB | 509 KB | core → savings waterfall; date-fns |
| /now | 20 | 320 ms | 4.77 / 2.65 / 1.34 s | 16 | 128 | 298 KB | 507 KB | core → page data waterfall |
| /cash-accounts | 20 | 332 ms | 4.76 / 2.88 / 1.93 s | 18 | 131 | 305 KB | 519 KB | core → savings (8 seq.) → accounts reload ×2 → NW POST |
| /year | 23 | 352 ms | 4.61 / 2.80 / 1.49 s | 15 | 126 | 298 KB | 507 KB | core → savings waterfall |
| /financial-health | 23 | 336 ms | 4.61 / 2.61 / 1.32 s | 20 | 140 | 304 KB | 527 KB | core → 8 page APIs |
| /bto/price-finder | 23 | 336 ms | 4.58 / 2.73 / 1.47 s | 17 | 131 | 337 KB | 508 KB | core → household/BTO (5 seq.) |
| /wealth | 24 | 344 ms | 4.53 / 2.57 / 1.30 s | 15 | 129 | 309 KB | 523 KB | core → savings waterfall |
| /me | 27 | 312 ms | 4.64 / 2.36 / 1.30 s | 18 | 131 | 226 KB | 519 KB | core → household (7 seq.) |
| /bto | 29 | 368 ms | 4.30 / 2.50 / 1.31 s | 14 | 129 | 337 KB | 510 KB | core → household/BTO |
| /cards | 50 | 356 ms | 3.24 / 1.96 / 1.16 s | 15 | 128 | 337 KB | 507 KB | statements ensure-on-read |
| /savings | 52 | 352 ms | 3.13 / 1.85 / 1.06 s | 15 | 126 | 304 KB | 507 KB | /api/savings 8 seq. |
| /debt | 54 | 344 ms | 3.04 / 1.84 / 1.19 s | 13 | 125 | 337 KB | 507 KB | core bundle |
| /dashboard | 55 | 348 ms | 2.99 / 2.28 / 1.12 s | 16 | 127 | 303 KB | 510 KB | core bundle + 4 analytics APIs |
| /miles | 55 | 336 ms | 3.02 / 2.00 / 1.00 s | 13 | 125 | 337 KB | 506 KB | core bundle |
| /this-month | 57 | 332 ms | 3.17 / 1.90 / 1.06 s | 15 | 126 | 220 KB | 507 KB | core bundle |
| /this-month-cashflow | 57 | 316 ms | 3.13 / 2.05 / 0.94 s | 15 | 126 | 222 KB | 507 KB | core bundle |
| /past-cashflow | 59 | 368 ms | 2.79 / 1.70 / 0.99 s | 14 | 126 | 299 KB | 508 KB | core bundle |
| /travel | 61 | 316 ms | 2.70 / 1.80 / 0.95 s | 13 | 125 | 305 KB | 506 KB | core + /api/travel/trips (6 seq.) |
| /poker/stats | 62 | 312 ms | 2.66 / 1.63 / 0.96 s | 13 | 129 | 318 KB | 532 KB | core bundle |
| /transactions | 64 | 340 ms | 2.78 / 1.67 / 0.91 s | 15 | 128 | 225 KB | 507 KB | core bundle |
| /oncall | 64 | 328 ms | 2.78 / 1.60 / 0.97 s | 15 | 127 | 228 KB | 508 KB | core bundle |
| /cpf | 64 | 356 ms | 2.57 / 1.53 / 0.89 s | 12 | 126 | 337 KB | 506 KB | core bundle; ships BTO/OtherLoans chunk |
| /expenses | 65 | 320 ms | 2.76 / 1.48 / 0.96 s | 14 | 125 | 222 KB | 507 KB | core bundle (unneeded) |
| /poker | 65 | 308 ms | 2.76 / 1.53 / 0.90 s | 14 | 134 | 233 KB | 534 KB | core bundle |
| /recurring | 66 | 340 ms | 2.68 / 1.62 / 0.87 s | 14 | 125 | 225 KB | 506 KB | core bundle |
| /benefits | 67 | 308 ms | 2.65 / 1.82 / 0.85 s | 14 | 125 | 222 KB | 508 KB | core bundle |

### Top 5 slowest pages and why
1. **/budget (4.86 s):** core bundle, then savings/accounts/funds, then budget data. Three stages, and `/api/savings` is 8 sequential DB calls.
2. **/now (4.77 s):** same core → page-data pattern, with 16 APIs.
3. **/cash-accounts (4.76 s):** core → savings (8 seq.) → `/api/accounts` fetched **twice** (route effect reload) → card statements → NW snapshot POST → NW history reload.
4. **/year (4.61 s)** and **/financial-health (4.61 s):** core, then savings plus 8 more analytics APIs. All of the projection's inputs are already in core *except* savings.
5. **/bto/price-finder (4.58 s)** and **/wealth (4.53 s):** core → household/BTO planner (5 sequential calls each for `/api/household/*`).

### Representative waterfall (dashboard, 230 ms)
```
0.00s  HTML (static) ── middleware Auth RTT
0.35s  FCP (shell)
0.60s  GET /api/auth/session ───────────────┤0.82s
0.98s  ├ 12 core APIs ─────────────────────────────────────────┤ ~2.2–2.6s (/api/state 5 seq. DB calls)
0.98s  ├ 4 dashboard analytics APIs ──────────────────┤ ~1.7–2.0s
0.98s  └ ~58 RSC prefetches (each = 1 Auth RTT on the server)
~3.0s  data ready
```
Target shape:
```
0.0s HTML (middleware: local JWT check or redirect) ── JS
0.3s ├ page-critical APIs (in parallel, ≤2 sequential DB calls each)  ─┤ ~0.6–0.9s @30ms
     └ secondary widgets stream in independently
```

### API endpoints (100 ms per DB call; empty tables)
Total = wall time; DB calls include 1 Auth call from middleware.

| Endpoint | Time | DB calls | ~Sequential depth | Notes |
|---|---:|---:|---:|---|
| /api/savings | 840 ms | 12 | 8 | household → members → pools → goals → shared goals, all sequential; also reloads accounts + funds that the client fetches separately |
| /api/summary | 844 ms | 19 | 8 | — |
| /api/household | 731 ms | 8 | 7 | fully sequential |
| /api/travel/trips | 627 ms | 9 | 6 | — |
| /api/state | 521 ms | 6 | 5 | runs household bootstrap + migration check on every GET just to return prefs |
| /api/household/bto-planner, partner-cpf, partner-bto-payments, savings/shared-contributions | ~525 ms | 6 | 5 | `ensureUserHousehold` + membership lookup repeated per endpoint |
| /api/expenses/summary | 326 ms | 14 | 3 | good parallelism |
| /api/credit-cards, /holdings, /funds, /other-loans, /credit-cards/calendar | ~315 ms | 4 | 3 | — |
| most others | ~210 ms | 3 | 2 | Auth + 1–2 queries |

With real data, `/api/credit-cards/statements` grows with the number of cards and statements: sequential ensure-loop per card plus a full-history spend index (PERF-007).

### Other performance findings
* **PERF-004 (P2): sequential awaits in hot endpoints.** `loadSavingsBundle` (`lib/savings/load-bundle.ts:17-60`), `/api/household`, `/api/state`, travel. `Promise.all` independent queries; cache `householdId` per request. Drop `/api/accounts` + `/api/funds` from pages that already get them inside `/api/savings`. *Expected:* `/api/savings` 8 → 3 sequential (−1.1 s @230 ms).
* **PERF-005 (P2): date-fns loaded globally.** `components/chart-setup.ts:21` imports `chartjs-adapter-date-fns`, pulling a **78 KB gz / 243 KB raw** chunk into every chart page. Only `PokerStatsTrends` uses a time scale. Move the import there. *Expected:* dashboard initial JS 303 → ~225 KB gz (−26%), same for /cpf, /wealth, /year, /bto, /debt, /miles, /savings…
* **PERF-006 (P2): unmemoised context values.** `useAppDataProvider` returns a fresh object every render, and all 9 providers live in one component. Any provider update re-renders every `useAppData()` consumer. `useMemo` the returned values (and/or split providers). *Measure:* React Profiler commit count on navigation.
* **PERF-007 (P2): card statements recompute full history on every GET**, with writes inside the read. Bound to the displayed cycles and precompute on write.
* **Bundle:** route-level splitting works (initial JS 220–337 KB gz; react-dom 71 KB). Some shared chunks group unrelated features (e.g. `/cpf` ships the TabBTO/OtherLoans chunk, 39 KB gz). `globals.css` is 125 KB raw / 19 KB gz, a single global stylesheet. Nothing egregious beyond date-fns.
* **Caching:** don't cache financial reads at the HTTP layer. Safe wins: a client query cache (SWR/React Query) with *revalidate-on-focus* so navigation between pages renders instantly from cache while refreshing. The session already behaves like a cache via `AppDataProvider`, but without staleness tracking.
* **Loading UX:** pages render a single "Loading your financial data…" until *all* core data arrives. One slow endpoint (e.g. `/api/state` for prefs) blocks unrelated content. Charts aren't the blocker. Render critical numbers first and skeleton the rest.

### Performance targets (for this architecture)

| Metric | Target | Why |
|---|---|---|
| FCP | < 0.4 s (already met) | static shell |
| Time to critical numbers | < 1.0 s at p75 on 4G | 1 stage, co-located |
| Time to all page data | < 1.5 s | secondary widgets may stream |
| API p95 (server) | < 300 ms; ≤ 2 sequential DB calls | co-located DB ~5–30 ms/call |
| Supabase Auth calls per page | ≤ 1 | local JWT verification |
| Requests per page load | < 25 | drop prefetch storm and unused core |
| Initial JS | < 230 KB gz | remove date-fns from shared path |

Measure with Vercel Speed Insights (real users), `perf-harness/pages.js` (synthetic, repeatable), and Supabase query performance reports.

---

# Testing Audit

**What's good:** 97 test files / 576 tests covering finance math, BTO, card statement cycles/interest/pay splits, budget months, SGT time, travel splits, poker stats, reimbursement netting, expense ↔ ledger mapping. CI runs them under `TZ=Asia/Singapore`. Tests are meaningful (boundary dates, carry-in, BT netting), not just snapshots.

**What's missing (highest financial risk first):**
1. **Write-path tests with a real Postgres** (Supabase local / testcontainers) for `app/api/savings` PUT, `accounts` PUT, `saveCreditCards`, `saveLoans`, `saveHoldings`. Assert *no deletes of omitted rows* and *no orphaned ledger links*. These would have caught DATA-001/002.
2. **Ledger invariants:** for random sequences of deposit/withdraw/delete/reverse, `account.balance == opening + Σ ledger`. Also concurrency (N parallel writes).
3. **RLS policy tests (pgTAP):** household join without invite fails; user A cannot read B's rows in every table.
4. **API route tests:** 401 without session; forged identity header rejected (SEC-003); malformed bodies → 400 not 500; IDs of another user → 404.
5. **CPF contribution add/edit/delete round-trip** returns the balance exactly to the start (catches clamping).
6. **Projection ↔ wealth consistency:** `simulate5y(...)[0].nw === netWorthTotal(...)`.
7. **>1000-row aggregation tests** for the spend index and analytics.
8. **E2E smoke (Playwright, already installed in the toolchain):** sign-in stub → each page renders numbers → edit/save a card/goal → reload → history intact.

---

# Code Quality / Architecture

* **Layering is sensible** (`lib/` domain modules, thin-ish routes, documented conventions in `AGENTS.md`). Docs are unusually thorough for a personal project, but have drifted: migration counts, "quotes is unauthenticated", "Postgres JSONB" in README, `09-*` filename collisions.
* **Vibe-code risks found (concrete):**
  * *Competing implementations of one concept:* net worth (FIN-001), CPF interest constants ×4, `roundMoney` ×2, `UUID_RE` redefined per file, household lookup re-implemented in 6 places.
  * *Happy-path-only persistence:* replace-all saves, unchecked compensations, ignored `{ error }` results (`saveLoans`, `saveHoldings`, invite accept/decline updates).
  * *Giant components:* TabRecurring 57 KB, TabWealth 45 KB, TabBTO 44 KB, BtoPriceFinder 37 KB, OtherLoansPanel 37 KB. Business rules sit inside UI (e.g. NW snapshot effect, CPF save).
  * *Fragile string matching:* `isDebtBudgetCategory` infers category type from free-text names ("loan", "instalment", "debt").
  * *Magic numbers:* margin 4.8% / $300, CPF rates, hard-coded 2026-06…2027-12 window.
  * *Dead / legacy code:* `parseBudgetCsv`, legacy `dashboard_state` migration path run on every GET, `dashboard_state_legacy`, deprecated `budget_lines.amount`, `isSupabaseConfigured`.
  * *Silent error handling:* `catch → console.warn` in data loaders; `catch {}` on JSON import.
  * *Deprecated framework convention:* `middleware.ts` (Next 16 → `proxy.ts`).
* **Not over-engineered:** abstractions are mostly proportionate. The problem is under-engineering of the *write* side, not excess abstraction.

---

# Production Readiness

| Area | Status |
|---|---|
| Build / CI | ✅ lint + tests + build on PRs to main |
| Deploy | ⚠ Vercel, no region pin, no preview-DB separation evident; dev bypass correctly disabled in prod |
| Migrations | ❌ manual, untracked, no rollback (OPS-001) |
| Backups / DR | ❌ unverified (BKP-001) |
| Observability | ❌ `console.*` only — no error tracking (Sentry etc.), no request/correlation IDs, no health endpoint, no alerting. *At 2 AM you'd have Vercel function logs with a `[api/...]` prefix and the raw error string — enough for simple crashes, not for "my balance is wrong"* (OPS-002, P2). Add an append-only audit log table for balance-changing operations. |
| Privacy | ⚠ logs include amounts, emails (invitee), Telegram link codes; Vercel Analytics + Speed Insights collect URLs (incl. `?ym=`), no financial values. Data stays in Supabase/Vercel; Yahoo receives tickers only; Telegram receives whatever the bot replies (balances/budgets) — acceptable if understood. |
| Config | ✅ env-driven; placeholders in CI; `NEXT_PUBLIC_*` limited to URL/anon key/branding. |

---

# Edge Cases

| Scenario | Current behaviour |
|---|---|
| Transient API failure on load, then edit + save | **Data loss** (DATA-002) |
| Rename a savings goal | **Goal history detached** (DATA-001) |
| Edit joint pools | **Joint ledger deleted** (DATA-001) |
| Double-click "Add expense" / retry after timeout | Duplicate expense + duplicate withdrawal (no idempotency) |
| You and partner edit a pool at the same time | Lost update on balance (DATA-003) |
| Loan with monthly = $0 saved | Silently deleted (DATA-002) |
| Change a holding's ticker | Holding recreated; **dividend history deleted** |
| CPF contribution added when OA was manually lowered, then deleted | Balance doesn't return to the original (clamp) |
| > 1000 card transactions since first statement | Wrong tracked spend / interest (DATA-004) |
| User aged > 35 | CPF allocation split wrong (FIN-003) |
| Viewing Debt chart in Nov 2026 | Chart labelled from Jun 2026, ends Dec 2027 (FIN-002) |
| Changing an insurance premium | Past months' budgets change (FIN-005) |
| `$0` income | Ratios guarded (`income > 0 ? … : 0`) ✅ |
| Negative or zero expense amount | Rejected by API ✅ (DB has no check — direct PostgREST allows it) |
| Fractional cents (`12.345`) | Ledger columns round to cents; `expenses.amount` stores 12.345 → inconsistent sums |
| Month-end recurring day 31 in Feb | Clamped correctly (`effectiveCalendarDay`) ✅ |
| Server near SGT midnight | SGT helpers used ✅; one exception: travel default year uses server UTC year |
| First-ever load | Seeds household + income categories on GET; concurrent first loads can 500 |
| Browser refresh during a multi-step save | Partial state possible (DATA-003) |

---

# Prioritized Findings

| ID | Sev | Category | Location | Problem | Recommended action |
|---|---|---|---|---|---|
| DATA-001 | P0 | Data integrity | `app/api/savings/route.ts:72-122` | Goals/pools delete-and-reinsert; cascades wipe pool ledger, detach goal history | Diff-based upsert by id; explicit delete endpoint; don't write balances from form |
| DATA-002 | P0 | Data integrity | `lib/credit-cards/load.ts:44-52`, `app/api/accounts/route.ts:59-64`, `lib/holdings/load.ts:78-82`, `lib/loans/load.ts:34,74-78`, `hooks/useAppData.ts:225-240` | Replace-all saves delete omitted rows; cascades to statements / account ledger / dividends | Per-row CRUD or explicit `deletedIds`; block edits after failed load; restrict FKs |
| BKP-001 | P0 | Recovery | `TabMe.tsx:220-255`; Supabase | No verified backups; export incomplete; import no-op | Verify plan backups, `pg_dump` now, PITR, real export, restore drill |
| SEC-001 | P1 | Authorization | `003_couples_and_ledger.sql:168-176` | Any user can join any household | SECURITY DEFINER accept function; drop insert/update policies; cap at 2 |
| SEC-003 | P1 | Authentication | `middleware.ts:9-11`, `lib/auth/require-user.ts:47-51` | Forged identity header honoured on `*.png` paths (confirmed) | Sign/nonce the header or don't exclude `/api` |
| SEC-002 | P1 | Dependencies | `package.json` | next 16.2.12 critical advisories | Upgrade to ≥16.4.6; `npm audit fix` |
| DATA-003 | P1 | Data integrity | `lib/savings/ledger.ts`, `lib/expenses/ledger-sync.ts`, `lib/funds/ledger.ts`, `lib/cpf/contributions.ts` | Non-atomic balance updates; no idempotency | Postgres functions via RPC; atomic `balance = balance + delta`; idempotency keys |
| DATA-004 | P1 | Fin. correctness | `lib/cards/statement-spend-index.ts:78-110`, analytics routes | 1000-row truncation | SQL aggregation / bounded windows / pagination |
| FIN-001 | P1 | Fin. correctness | `lib/finance/projection.ts` | Projection NW & cash differ from Wealth NW | Seed from `wealthSummary`; include insurance & personal loans |
| REL-001 | P1 | Reliability | `hooks/useAppData.ts`, `lib/fetch-json.ts`, `TabCPF.tsx` | Failed loads look like $0; no timeouts; silent save failures | Error states, timeouts, snackbars |
| UX-001 | P1 | UX reliability | `TabMe.tsx:228-255,603` | Reset/Dummy/Import in-memory only, claim "saved", no confirm | Remove or make explicit server ops |
| PERF-001 | P1 | Performance | `vercel.json` | No region pin; latency-bound | Verify regions; pin `sin1` |
| PERF-002 | P1 | Performance | `lib/supabase/middleware.ts` | 76 Auth calls per page load | Skip prefetch/docs; `getClaims`; `prefetch={false}` |
| PERF-003 | P1 | Performance | `RequireAuth`, `useAppData`, `DomainPage` | 3-stage waterfall; unneeded core data | Parallelise; per-page data needs; progressive render |
| SEC-004 | P2 | Security | `MagicLinkAuth.tsx:37` | Open sign-up | Disable sign-ups / allowlist |
| DATA-005 | P2 | Data integrity | `TabCashAccounts.tsx:123-133` | NW history written from partial client state | Server-side snapshot or gate on all-loaded |
| DATA-006 | P2 | Reliability | statements GET, `/api/state`, `lib/income/load.ts:21-24` | GETs write; races; unbounded recursion | Move writes to explicit actions/migrations; bound recursion |
| DATA-007 | P2 | Money repr. | migrations | Mixed `numeric` / `numeric(14,2)`; few money checks | `numeric(14,2)` + checks everywhere; one `roundMoney` |
| DATA-008 | P2 | Security/integrity | architecture | Direct PostgREST bypasses API validation | DB constraints + RPC for writes |
| FIN-002 | P2 | Fin. display | `lib/finance/debt.ts:99` | Hard-coded 2026-06…2027-12 burn-down | Start at current month, end at last loan end |
| FIN-003 | P2 | Fin. assumptions | `lib/finance/cpf.ts`, `income.ts`, `projection.ts` | Age ≤35 CPF only; tax ignored; CPF interest timing approx.; rates ×4 | Age input; show assumptions; centralise constants |
| FIN-005 | P2 | Fin. history | `lib/finance/budget.ts`, `loanLoad.ts` | Past months use current insurance/ILP/subscriptions/loans | Snapshot computed lines per month (like salary) |
| PERF-004 | P2 | Performance | `lib/savings/load-bundle.ts`, household/state/travel routes | 5–8 sequential DB calls; duplicate loads | `Promise.all`; reuse household id; drop dup fetches |
| PERF-005 | P2 | Bundle | `components/chart-setup.ts:21` | 78 KB gz date-fns on every chart page | Import adapter only in PokerStatsTrends |
| PERF-006 | P2 | Rendering | `hooks/useAppData.ts` return, `AppDataProvider` | Unmemoised context → app-wide re-renders | `useMemo` values / split providers |
| PERF-007 | P2 | Performance | `lib/credit-cards/card-statements/load.ts` | Full-history recompute + writes on every GET | Bound to displayed cycles |
| OPS-001 | P2 | Deployment | `supabase/migrations`, docs | Manual untracked migrations | Supabase CLI migrations + CI check |
| OPS-002 | P2 | Observability | — | Logs only; no error tracking / IDs / health / audit log | Sentry (scrub PII), request IDs, audit table |
| TEST-001 | P2 | Testing | — | No write-path/API/RLS/E2E tests | See Testing Audit list |
| SEC-005 | P3 | Security | `vercel.json` | No CSP; JS-readable auth cookies | Add CSP |
| SEC-006 | P3 | Privacy | routes, `lib/telegram/links.ts:42` | Raw DB errors to client; PII/codes in logs | Generic errors; scrub logs |
| CODE-001 | P3 | Maintainability | various | Dead CSV parser w/ UTC date bug; dup helpers; magic numbers; deprecated `middleware.ts`; doc drift | Clean up opportunistically |
| CODE-002 | P4 | Maintainability | `TabRecurring.tsx`, `TabWealth.tsx`, `TabBTO.tsx` | Giant components | Split when next touched |

---

# Page Performance Scorecard

| Page | Score | Initial Load (FCP) | API Time (data ready @230 ms) | DB Time (worst API, seq. calls × latency) | JS/Render | Requests | Payload | Main Bottleneck |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| /budget | 18 | 376 ms | 4.86 s | 8 × 230 ms (/api/savings) | 301 KB gz | 129 | 509 KB | core → savings waterfall |
| /now | 20 | 320 ms | 4.77 s | 5 × 230 ms (/api/state) | 298 KB | 128 | 507 KB | core → page waterfall |
| /cash-accounts | 20 | 332 ms | 4.76 s | 8 × 230 ms | 305 KB | 131 | 519 KB | savings + duplicate accounts reloads |
| /year | 23 | 352 ms | 4.61 s | 8 × 230 ms | 298 KB | 126 | 507 KB | core → savings |
| /financial-health | 23 | 336 ms | 4.61 s | 8 × 230 ms | 304 KB | 140 | 527 KB | core → 8 APIs |
| /bto/price-finder | 23 | 336 ms | 4.58 s | 5 × 230 ms | 337 KB | 131 | 508 KB | household/BTO chain |
| /wealth | 24 | 344 ms | 4.53 s | 8 × 230 ms | 309 KB | 129 | 523 KB | core → savings |
| /me | 27 | 312 ms | 4.64 s | 7 × 230 ms (/api/household) | 226 KB | 131 | 519 KB | household chain |
| /bto | 29 | 368 ms | 4.30 s | 5 × 230 ms | 337 KB | 129 | 510 KB | household/BTO |
| /cards | 50 | 356 ms | 3.24 s | 3 × 230 ms (grows per card) | 337 KB | 128 | 507 KB | statements ensure-on-read |
| /savings | 52 | 352 ms | 3.13 s | 8 × 230 ms | 304 KB | 126 | 507 KB | /api/savings |
| /debt | 54 | 344 ms | 3.04 s | 5 × 230 ms | 337 KB | 125 | 507 KB | core bundle |
| /dashboard | 55 | 348 ms | 2.99 s | 5 × 230 ms | 303 KB | 127 | 510 KB | core + analytics |
| /miles | 55 | 336 ms | 3.02 s | 5 × 230 ms | 337 KB | 125 | 506 KB | core bundle |
| /this-month | 57 | 332 ms | 3.17 s | 5 × 230 ms | 220 KB | 126 | 507 KB | core bundle |
| /this-month-cashflow | 57 | 316 ms | 3.13 s | 5 × 230 ms | 222 KB | 126 | 507 KB | core bundle |
| /past-cashflow | 59 | 368 ms | 2.79 s | 5 × 230 ms | 299 KB | 126 | 508 KB | core bundle |
| /travel | 61 | 316 ms | 2.70 s | 6 × 230 ms | 305 KB | 125 | 506 KB | core + trips |
| /poker/stats | 62 | 312 ms | 2.66 s | 5 × 230 ms | 318 KB | 129 | 532 KB | core bundle |
| /transactions | 64 | 340 ms | 2.78 s | 5 × 230 ms | 225 KB | 128 | 507 KB | core bundle |
| /oncall | 64 | 328 ms | 2.78 s | 5 × 230 ms | 228 KB | 127 | 508 KB | core bundle |
| /cpf | 64 | 356 ms | 2.57 s | 5 × 230 ms | 337 KB | 126 | 506 KB | core bundle |
| /expenses | 65 | 320 ms | 2.76 s | 5 × 230 ms | 222 KB | 125 | 507 KB | unneeded core bundle |
| /poker | 65 | 308 ms | 2.76 s | 5 × 230 ms | 233 KB | 134 | 534 KB | core bundle |
| /recurring | 66 | 340 ms | 2.68 s | 5 × 230 ms | 225 KB | 125 | 506 KB | core bundle |
| /benefits | 67 | 308 ms | 2.65 s | 5 × 230 ms | 222 KB | 125 | 508 KB | core bundle |

*(The "5 × 230 ms" for core-bound pages is `/api/state`, the slowest core endpoint. All figures are with empty tables.)*

---

# Recommended Roadmap

Each item: complexity · risk · depends on · benefit.

### Phase 0 — Immediate safety (before trusting more data to the app)
1. **Verify Supabase backups + take an off-platform `pg_dump`** · S · none · — · makes everything else recoverable.
2. **DATA-001** goals/pools diff-based save · M · medium · — · stops routine history destruction.
3. **DATA-002** stop delete-by-omission (cards, accounts, holdings, loans) + disable editing after a failed load (REL-001 part) · M · medium · — · removes the cascade-wipe path.
4. **UX-001** remove/confirm Me-page Reset/Dummy/Import · S · low · — · removes a DATA-002 trigger.
5. **SEC-001** household join via SECURITY DEFINER function · S · low · — · closes unauthorized access.

### Phase 1 — Correctness
6. FIN-001 projection ↔ wealth consistency · S · low.
7. DATA-004 truncation-safe aggregation · M · low–medium.
8. FIN-002 debt burn-down window · S · low.
9. DATA-005 NW snapshot correctness · S–M · low.
10. FIN-003/FIN-005 surface assumptions; age-aware CPF allocation; snapshot computed monthly lines · M · low (needs your decision on intended behaviour).

### Phase 2 — Security
11. SEC-003 signed identity header · S · low.
12. SEC-002 Next.js/transitive upgrades · S · low–medium.
13. SEC-004 disable open sign-up · S (dashboard setting) · low.
14. SEC-005/006 CSP, error/log scrubbing · S · low.

### Phase 3 — Performance (measured baseline in this report; re-measure after each)
15. PERF-001 region pin (after verifying regions) · S · very low · **biggest win**.
16. PERF-002 middleware auth diet + `prefetch={false}` · S · low.
17. PERF-005 date-fns out of shared path · S · very low.
18. PERF-004 parallelise sequential endpoints; drop duplicate fetches · S–M · low.
19. PERF-003 remove client session gate; per-page data needs; progressive render · M–L · medium.
20. PERF-006 memoise context values · S · low.
21. PERF-007 bounded statements loader · M · medium (depends on DATA-004).

### Phase 4 — Reliability
22. DATA-003 atomic ledger RPCs + idempotency keys · L · medium–high · depends on Phase 0 tests.
23. REL-001 rest: timeouts, visible errors everywhere · S–M · low.
24. DATA-006 remove writes from GETs · M · medium.
25. OPS-002 error tracking, request IDs, audit log, health check · M · low.
26. OPS-001 tracked migrations · M · low.

### Phase 5 — Testing (start alongside Phase 0; each fix lands with its regression test)
27. Local-Postgres integration tests for write paths and ledger invariants · M.
28. pgTAP RLS tests · M.
29. API route tests (auth, forged header, malformed input) · M.
30. Playwright E2E smoke across all pages · M.

### Phase 6 — Architecture
31. Consolidate duplicated rules (NW, CPF constants, roundMoney, household lookup) · M.
32. DATA-007 money column normalisation + DB checks · M.
33. Split giant components when next touched · L (incremental).

### Phase 7 — UX
34. Skeletons/progressive loading; per-section error/retry · M.
35. Show projection & CPF assumptions on screen · S.

---

# Do Not Touch (already good — avoid churn)

* **`lib/time/sgt.ts` and its consistent use** for "today", month keys and timestamps. Tests pass in three timezones.
* **Card statement cycle / carry-in / BT netting / pay-split math** (`lib/cards/*`, `lib/credit-cards/card-statements/{latest,pay-split,batch-statement,cycle-offset,calendar-amounts}.ts`). Subtle, documented, consistently called, well tested. Fix only the *loading* concerns (DATA-004, PERF-007), not the math.
* **Monthly budget snapshots (migration 063)**, including salary history: the right design, keep it.
* **Auth callback + `safeRelativeRedirectPath`**, dev-bypass production guard.
* **RLS coverage on all tables and owner policies** (except `household_members`).
* **Expense POST validation** (amount finite & > 0, date/time parsing, auto-payment validation).
* **Telegram link-code design** and webhook secret check.
* **BTO calculators** (`bto*.ts`): heavily tested; only re-verify grant tables against current HDB figures if you rely on them.
* **CPF constants for 2026, age ≤ 35** (37%, $8,000 OW ceiling, allocation ratios): correct as of today.
* **CI pipeline** (lint → test with TZ → build).
* **Route-level code splitting**: already working; don't restructure the bundle beyond PERF-005.

---

## Appendix — Reproducing the measurements
```
cd webapp
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npx next build
MOCK_LATENCY_MS=230 node ../documentation/audit/perf-harness/mock-supabase.js &
npx next start -p 3100 &
node ../documentation/audit/perf-harness/cookie.js > ../documentation/audit/perf-harness/cookie.txt
ROUTES=/dashboard,/year CPU_THROTTLE=4 node ../documentation/audit/perf-harness/pages.js
```
`mock-supabase.js` exposes `GET /__stats?reset=1` (call count, max in-flight) for per-endpoint DB round-trip counts. The harness forges a session **only for the local mock**; it can't authenticate against a real Supabase project.
