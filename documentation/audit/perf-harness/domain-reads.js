// Which data domains does each route actually read? Run against a probe build where no route
// declares any domain and NEXT_PUBLIC_DOMAIN_GUARD=1, so every read is logged in
// window.__domainGuard as { domain, field }. Output: domain-reads.json.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const [cName, ...rest] = fs.readFileSync(path.join(__dirname, "cookie.txt"), "utf8").split("=");
const ROUTES = (process.env.ROUTES || "").split(",").filter(Boolean);
(async () => {
  const b = await chromium.launch();
  const out = {};
  for (const route of ROUTES) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: cName, value: rest.join("="), domain: "localhost", path: "/" }]);
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
    await p.goto("http://localhost:3100" + route);
    await p.waitForTimeout(4500);
    const reads = await p.evaluate(() => window.__domainGuard || []);
    const byDomain = {};
    for (const r of reads) (byDomain[r.domain] ||= new Set()).add(r.field);
    out[route] = Object.fromEntries(Object.entries(byDomain).map(([d, f]) => [d, [...f].sort()]));
    if (errors.length) out[route].__pageErrors = errors;
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(__dirname, process.env.OUT || "domain-reads.json"), JSON.stringify(out, null, 2));
  for (const [r, d] of Object.entries(out)) console.log(r.padEnd(22), Object.keys(d).sort().join(", ") || "(none)");
})();
