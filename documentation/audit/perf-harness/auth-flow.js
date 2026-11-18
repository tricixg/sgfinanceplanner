// Browser-level checks of the client-side session gate against the mock (run once per mock mode):
//   node auth-flow.js ok       # mock accepts the cookie   -> app renders, no /api/auth/session call
//   node auth-flow.js reject   # mock started with MOCK_AUTH_REJECT=1 -> 401 -> lands on /login
//   node auth-flow.js anon     # no cookie                 -> redirected to /login?next=...
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const mode = process.argv[2];
const [cName, ...rest] = fs.readFileSync(path.join(__dirname, "cookie.txt"), "utf8").split("=");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  if (mode !== "anon") await ctx.addCookies([{ name: cName, value: rest.join("="), domain: "localhost", path: "/" }]);
  const p = await ctx.newPage();
  const apis = [];
  p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) apis.push(u.pathname); });
  await p.goto("http://localhost:3100/dashboard");
  await p.waitForTimeout(3500);
  const u = new URL(p.url());
  console.log(JSON.stringify({ mode, finalPath: u.pathname, next: u.searchParams.get("next"), sessionCalls: apis.filter((x) => x === "/api/auth/session").length, apiCount: apis.length, loginFormShown: /sign in|magic link|email/i.test(await p.innerText("body")) }));
  await b.close();
})();
