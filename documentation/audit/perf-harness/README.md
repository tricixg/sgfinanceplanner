# Performance harness

Local, repeatable measurements of the app against a **mock Supabase** (no real data, no real
project). Numbers are a lower bound and a before/after tool, not production figures.

| File | What it does |
|---|---|
| `mock-supabase.js` | Supabase stand-in on :54321. Empty tables (except a seeded household membership and a migrated `dashboard_state` row), fixed delay per call (`MOCK_LATENCY_MS`), verifies ES256 JWT signatures and serves a JWKS like a project on asymmetric signing keys. `GET /__stats?reset=1` returns every call since the last reset. `MOCK_NO_HOUSEHOLD=1` measures the first-sign-in path; `MOCK_AUTH_REJECT=1` makes Auth reject every token. |
| `cookie.js` | Forges a session cookie **for the mock only** (`node cookie.js forged` signs with a different key). Writes `keypair.json` (git-ignored). |
| `pages.js` | Playwright page loads at 4x CPU throttle: data-ready time (last API response), requests, API requests, Supabase Auth calls, initial JS gzip. `REPEAT=N` reports the median of N loads. |
| `endpoints.js` | Per-endpoint Supabase calls and **sequential depth** (longest chain of non-overlapping calls; use `MOCK_LATENCY_MS=100`). |
| `run-all.sh <dir>` | Builds, starts app + mock, runs `pages.js` at 30 and 100 ms and `endpoints.js` at 100 ms into `<dir>/`. `SKIP_BUILD=1`, `ROUTES=...`, `REPEAT=N`. |
| `compare.js <before> <after> [routes]` | Markdown before/after tables from two result directories. |
| `security-check.js` | 48 black-box checks: every API rejects missing/forged/spoofed credentials, pages redirect when signed out. Needs the app + mock running. |
| `auth-flow.js ok\|anon\|forged` | Browser-level session-gate flows. |
| `domain-reads.js` | Which data domains each route reads (needs a build with `NEXT_PUBLIC_DOMAIN_GUARD=1`; for the probe also a temporary `domainsForPath` returning `[]`). Results: `domain-reads.json` (probe), `domain-reads-with-table.json` (table applied, expected empty). |

```
cd documentation/audit/perf-harness
./run-all.sh my-run                         # all routes, both latencies, endpoints
REPEAT=5 ROUTES=/wealth,/me ./run-all.sh x  # median of 5 for chosen routes
node compare.js baseline-seeded-after-perf-005 after-phase3
```

Notes
- `data-ready` is the end of the last API response of the page; single runs vary by +-100 ms, so
  compare medians (`REPEAT`).
- Tables are empty, so loops over rows, payload sizes and real Postgres time are not measured.
- Kill stale servers between runs (`run-all.sh` does): a leftover `next-server` serves an old build.

## Result sets

| Directory | What |
|---|---|
| `baseline-2026-11-17/` | Original audit numbers (pre-Phase 0, default Vercel region assumptions). |
| `baseline-2026-11-17-main-after-phase2/` | Main after Phases 0-2, **unseeded** mock (household create path inflates depth). |
| `baseline-seeded-after-perf-005/` | Phase 3 baseline: seeded household, after PERF-005. Use this for before/after. |
| `after-perf-005`, `after-perf-004`, `after-perf-006`, `after-perf-003-*`, `after-perf-002` | One set per step. `after-perf-005` and the first `baseline-2026-11-17-main-*` use the unseeded mock. |
| `rep-step-b`, `rep-step-c` | Median-of-5 comparison for the domain-scoped loading steps. |
| `after-phase3/` | Final measurements (median of 3) and `SUMMARY.md`. |
