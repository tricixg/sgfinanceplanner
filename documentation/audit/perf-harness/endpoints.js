// Per-endpoint Supabase round-trips against the mock. For each GET endpoint: total Supabase
// calls, Auth calls, and sequential depth (longest chain of non-overlapping calls, which with
// a fixed per-call latency is the number of dependent round-trips). Run with
// MOCK_LATENCY_MS=100 so parallel calls (which start within a few ms of each other) are not
// confused with sequential ones.
//   ENDPOINTS=/api/state,/api/savings OUT=endpoints.json node endpoints.js
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3100";
const MOCK = "http://127.0.0.1:54321";
const LATENCY = Number(process.env.MOCK_LATENCY_MS || 100);
const cookie = fs.readFileSync(path.join(__dirname, "cookie.txt"), "utf8");
const DEFAULT = [
  "/api/auth/session", "/api/state", "/api/profile", "/api/loans", "/api/other-loans",
  "/api/budget-lines", "/api/credit-cards", "/api/holdings", "/api/portfolio/snapshots",
  "/api/net-worth/snapshots", "/api/cpf/contributions", "/api/cpf/transactions",
  "/api/savings", "/api/accounts", "/api/funds", "/api/summary", "/api/household",
  "/api/household/bto-planner", "/api/household/partner-cpf", "/api/household/partner-bto-payments",
  "/api/savings/shared-contributions", "/api/travel/trips", "/api/expenses/summary",
  "/api/credit-cards/statements", "/api/credit-cards/statements/outstanding",
  "/api/credit-cards/calendar", "/api/expenses", "/api/transactions", "/api/miles",
  "/api/benefits", "/api/recurring", "/api/poker", "/api/poker/stats",
  "/api/spending/analytics", "/api/income/analytics",
];
const list = (process.env.ENDPOINTS || "").split(",").filter(Boolean);
const endpoints = list.length ? list : DEFAULT;

// Longest chain of calls where each starts after the previous ended (minus 15% slack).
function depth(calls) {
  const sorted = [...calls].sort((a, b) => a.t0 - b.t0);
  let n = 0;
  let end = -Infinity;
  for (const c of sorted) {
    if (c.t0 >= end - LATENCY * 0.15) { n++; end = c.t0 + LATENCY; }
  }
  return n;
}

(async () => {
  const out = [];
  for (const ep of endpoints) {
    await fetch(`${MOCK}/__stats?reset=1`);
    const t0 = Date.now();
    const res = await fetch(BASE + ep, { headers: { cookie } });
    const wallMs = Date.now() - t0;
    await res.arrayBuffer();
    const stats = await (await fetch(`${MOCK}/__stats?reset=1`)).json();
    const auth = stats.calls.filter((c) => c.path.startsWith("/auth/")).length;
    const db = stats.calls.length - auth;
    out.push({ endpoint: ep, status: res.status, wallMs, authCalls: auth, dbCalls: db, sequentialDepth: depth(stats.calls.filter((c) => !c.path.startsWith("/auth/"))) });
  }
  fs.writeFileSync(path.resolve(__dirname, process.env.OUT || "endpoints.json"), JSON.stringify(out, null, 2));
  console.log("endpoint".padEnd(48), "status wall(ms) auth db depth");
  for (const r of out) console.log(r.endpoint.padEnd(48), String(r.status).padEnd(6), String(r.wallMs).padEnd(8), String(r.authCalls).padEnd(4), String(r.dbCalls).padEnd(2), r.sequentialDepth);
})();
