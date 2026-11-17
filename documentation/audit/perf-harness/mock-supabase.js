// Minimal Supabase stand-in for perf measurement: fake auth user, empty tables,
// injected latency per call. Logs every call so we can count round-trips.
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");

const LATENCY = Number(process.env.MOCK_LATENCY_MS || 100);
const LOG = process.env.MOCK_LOG || "/dev/null";
const USER = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "perf@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
let counter = 0;
const store = {};
const STATEFUL = new Set(["income_categories"]);
let inflight = 0;
let maxInflight = 0;
// Every call (start time, method, path) since the last reset, so a client can compute the
// number of Auth calls, DB calls and the sequential depth of a request.
let calls = [];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url.startsWith("/__stats")) counter++;
    inflight++;
    maxInflight = Math.max(maxInflight, inflight);
    const t0 = Date.now();
    setTimeout(() => {
      inflight--;
      const url = new URL(req.url, "http://x");
      fs.appendFileSync(LOG, `${t0} ${req.method} ${url.pathname}${url.search.slice(0, 120)}\n`);
      res.setHeader("Content-Type", "application/json");
      if (url.pathname === "/__stats") {
        const out = { counter, maxInflight, calls };
        if (url.searchParams.get("reset")) { counter = 0; maxInflight = 0; calls = []; }
        return res.end(JSON.stringify(out));
      }
      if (!url.pathname.startsWith("/__")) calls.push({ t0, method: req.method, path: url.pathname });
      if (url.pathname.startsWith("/auth/v1/user")) return res.end(JSON.stringify(USER));
      if (url.pathname.startsWith("/auth/v1/")) return res.end(JSON.stringify({}));
      const accept = String(req.headers["accept"] || "");
      const wantsObject = accept.includes("vnd.pgrst.object");
      const prefer = String(req.headers["prefer"] || "");
      if (req.method === "HEAD") { res.setHeader("Content-Range", "*/0"); return res.end(); }
      if (req.method === "GET") {
        if (prefer.includes("count=")) res.setHeader("Content-Range", "*/0");
        if (wantsObject) {
          res.statusCode = 406;
          return res.end(JSON.stringify({ code: "PGRST116", message: "no rows", details: "", hint: null }));
        }
        const tbl = url.pathname.split("/").pop();
        return res.end(JSON.stringify(STATEFUL.has(tbl) ? (store[tbl] || []) : []));
      }
      // writes: echo body with id
      let parsed = {};
      try { parsed = JSON.parse(body || "{}"); } catch {}
      const rows = (Array.isArray(parsed) ? parsed : [parsed]).map((r) => ({
        id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r,
      }));
      const tblW = url.pathname.split("/").pop();
      if (STATEFUL.has(tblW) && req.method === "POST") store[tblW] = (store[tblW] || []).concat(rows);
      if (req.method === "DELETE") return res.end(wantsObject ? "{}" : "[]");
      return res.end(JSON.stringify(wantsObject ? rows[0] : rows));
    }, LATENCY);
  });
});
server.listen(54321, "127.0.0.1", () => console.log("mock supabase on 54321, latency", LATENCY));
