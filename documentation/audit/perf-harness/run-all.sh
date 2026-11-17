#!/usr/bin/env bash
# Build + start the app against the mock and record all measurements into $1 (a directory).
#   ./run-all.sh after-perf-005          # runs from anywhere; needs webapp deps installed
# Env: SKIP_BUILD=1 to reuse an existing .next build.
set -euo pipefail
OUTDIR="$(mkdir -p "$1" && cd "$1" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
WEBAPP="$HERE/../../../webapp"
ROUTES_ALL="/dashboard,/now,/this-month,/this-month-cashflow,/past-cashflow,/year,/budget,/expenses,/transactions,/recurring,/cash-accounts,/savings,/wealth,/cpf,/debt,/cards,/bto,/bto/price-finder,/financial-health,/benefits,/miles,/oncall,/poker,/poker/stats,/travel,/me"
ROUTES="${ROUTES:-$ROUTES_ALL}"
export AUTH_HEADER_SECRET="${AUTH_HEADER_SECRET:-perf-harness-secret-0123456789abcdef}"
cd "$WEBAPP"
if [ -z "${SKIP_BUILD:-}" ]; then
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npx next build >"$OUTDIR/build.log" 2>&1
fi
node "$HERE/cookie.js" > "$HERE/cookie.txt"
pkill -f mock-supabase.js 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; sleep 1
cleanup() { pkill -f mock-supabase.js 2>/dev/null || true; pkill -f "next start" 2>/dev/null || true; }
trap cleanup EXIT
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon npx next start -p 3100 >"$OUTDIR/server.log" 2>&1 &
sleep 4
for L in 30 100; do
  MOCK_LATENCY_MS=$L node "$HERE/mock-supabase.js" >/dev/null 2>&1 &
  MOCKPID=$!
  sleep 1
  # warm the server (first hit compiles nothing in prod, but primes caches)
  curl -s -o /dev/null -b "$(cat "$HERE/cookie.txt")" http://localhost:3100/dashboard || true
  ROUTES="$ROUTES" CPU_THROTTLE=4 OUT="$OUTDIR/pages-$L.json" node "$HERE/pages.js" | tee "$OUTDIR/pages-$L.txt"
  if [ "$L" = 100 ]; then ENDPOINTS="${ENDPOINTS:-}" MOCK_LATENCY_MS=100 OUT="$OUTDIR/endpoints-100.json" node "$HERE/endpoints.js" | tee "$OUTDIR/endpoints-100.txt"; fi
  kill $MOCKPID; sleep 1
done
