// Side-by-side before/after table from two result directories.
//   node compare.js baseline-dir after-dir [route,route,...]
const fs = require("fs");
const path = require("path");
const [a, b, routesArg] = process.argv.slice(2);
const only = routesArg ? routesArg.split(",") : null;
const load = (d, f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, d, f), "utf8")); } catch { return null; } };
const by = (arr, k) => Object.fromEntries((arr || []).map((r) => [r[k], r]));
const p30a = by(load(a, "pages-30.json"), "route"), p30b = by(load(b, "pages-30.json"), "route");
const p100a = by(load(a, "pages-100.json"), "route"), p100b = by(load(b, "pages-100.json"), "route");
const f = (x, k, s = "") => (x ? `${x[k]}${s}` : "-");
console.log("| route | data-ready @30 ms | data-ready @100 ms | requests | API reqs | auth calls | initial JS gz |");
console.log("|---|---|---|---|---|---|---|");
for (const r of Object.keys(p30a)) {
  if (only && !only.includes(r)) continue;
  const x = p30a[r], y = p30b[r], x1 = p100a[r], y1 = p100b[r];
  console.log(`| ${r} | ${f(x,"dataReadyMs")} → ${f(y,"dataReadyMs")} | ${f(x1,"dataReadyMs")} → ${f(y1,"dataReadyMs")} | ${f(x,"requests")} → ${f(y,"requests")} | ${f(x,"apiRequests")} → ${f(y,"apiRequests")} | ${f(x,"authCalls")} → ${f(y,"authCalls")} | ${f(x,"initialJsGzKB"," KB")} → ${f(y,"initialJsGzKB"," KB")} |`);
}
const ea = by(load(a, "endpoints-100.json"), "endpoint"), eb = by(load(b, "endpoints-100.json"), "endpoint");
if (Object.keys(eb).length) {
  console.log("\n| endpoint | wall @100 ms | DB calls | sequential depth |");
  console.log("|---|---|---|---|");
  for (const e of Object.keys(ea)) {
    if (!eb[e]) continue;
    console.log(`| ${e} | ${ea[e].wallMs} → ${eb[e].wallMs} | ${ea[e].dbCalls} → ${eb[e].dbCalls} | ${ea[e].sequentialDepth} → ${eb[e].sequentialDepth} |`);
  }
}
