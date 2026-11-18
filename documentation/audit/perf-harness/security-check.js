// Black-box auth checks against the running app + mock (mock must be in normal, accepting mode).
// Every API must reject missing / forged-signature / spoofed-header requests; pages must
// redirect signed-out requests to /login; a valid session must work.
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3100";
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const good = read("cookie.txt"), forged = read("forged-cookie.txt");
const API = ["/api/state", "/api/profile", "/api/loans", "/api/holdings", "/api/savings", "/api/household",
  "/api/expenses", "/api/credit-cards", "/api/auth/session"];
const spoof = JSON.stringify({ id: "00000000-0000-4000-8000-0000000000ff" });
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); };
const get = (p, headers = {}) => fetch(BASE + p, { headers, redirect: "manual" });

(async () => {
  for (const ep of API) {
    const sessionEp = ep === "/api/auth/session"; // answers 200 {user:null} when signed out
    for (const [label, headers] of [
      ["no cookie", {}],
      ["forged-signature cookie", { cookie: forged }],
      ["spoofed identity header, no cookie", { "x-sgfp-verified-user": spoof }],
      ["spoofed identity header + forged cookie", { cookie: forged, "x-sgfp-verified-user": spoof }],
    ]) {
      const r = await get(ep, headers);
      const body = sessionEp ? await r.json() : null;
      check(`${ep} rejects ${label}`, sessionEp ? body.user === null : r.status === 401, `-> ${r.status}`);
    }
    const ok = await get(ep, { cookie: good });
    check(`${ep} accepts a valid session`, ok.status === 200, `-> ${ok.status}`);
  }
  for (const [label, headers, want] of [["no cookie", {}, 307], ["forged cookie", { cookie: forged }, 307], ["valid cookie", { cookie: good }, 200]]) {
    const r = await get("/dashboard?x=1", headers);
    const loc = r.headers.get("location") || "";
    check(`/dashboard page, ${label}`, r.status === want && (want === 200 || loc.includes("/login?next=%2Fdashboard%3Fx%3D1")), `-> ${r.status} ${loc}`);
  }
  for (const p of ["/login", "/auth/callback"]) check(`${p} stays public`, (await get(p)).status !== 307 || !(await get(p)).headers.get("location")?.includes("next="));
  console.log(failed ? `\n${failed} FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
