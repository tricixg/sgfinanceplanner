// Builds after-phase3/SUMMARY.md: per-page and per-endpoint before/after for Phase 3.
//   node phase3-summary.js <before-dir> <before-initial-js-dir> <after-dir>
const fs = require("fs");
const path = require("path");
const [beforeDir, jsDir, afterDir] = process.argv.slice(2);
const load = (d, f) => JSON.parse(fs.readFileSync(path.join(__dirname, d, f), "utf8"));
const by = (a, k) => Object.fromEntries(a.map((r) => [r[k], r]));
const B30 = by(load(beforeDir, "pages-30.json"), "route"), B100 = by(load(beforeDir, "pages-100.json"), "route");
const A30 = by(load(afterDir, "pages-30.json"), "route"), A100 = by(load(afterDir, "pages-100.json"), "route");
const J = by(load(jsDir, "pages-30.json"), "route");
const med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let md = "# Phase 3 before/after\n\nBefore = main after Phases 0-2 (+PERF-005 for timing/requests, which it does not affect; initial JS from the build before PERF-005). After = this branch, median of 3 loads. Mock Supabase, 4x CPU.\n\n";
md += "| page | data-ready @30 ms | data-ready @100 ms | requests | API requests | Auth calls | initial JS (gz) |\n|---|---|---|---|---|---|---|\n";
const d30 = [], d100 = [];
for (const r of Object.keys(B30)) {
  const b = B30[r], a = A30[r], b1 = B100[r], a1 = A100[r];
  d30.push(a.dataReadyMs - b.dataReadyMs); d100.push(a1.dataReadyMs - b1.dataReadyMs);
  md += `| ${r} | ${b.dataReadyMs} → ${a.dataReadyMs} | ${b1.dataReadyMs} → ${a1.dataReadyMs} | ${b.requests} → ${a.requests} | ${b.apiRequests} → ${a.apiRequests} | ${b.authCalls} → ${a.authCalls} | ${J[r].initialJsGzKB} → ${a.initialJsGzKB} KB |\n`;
}
md += `\nMedian change in data-ready: ${med(d30)} ms @30 ms, ${med(d100)} ms @100 ms (${d30.filter((x) => x < 0).length}/${d30.length} and ${d100.filter((x) => x < 0).length}/${d100.length} pages faster).\n\n`;
const EB = by(load(beforeDir, "endpoints-100.json"), "endpoint"), EA = by(load(afterDir, "endpoints-100.json"), "endpoint");
md += "## Endpoints (100 ms per DB call)\n\n| endpoint | sequential depth | DB calls | wall |\n|---|---|---|---|\n";
for (const e of Object.keys(EB)) if (EA[e]) md += `| ${e} | ${EB[e].sequentialDepth} → ${EA[e].sequentialDepth} | ${EB[e].dbCalls} → ${EA[e].dbCalls} | ${EB[e].wallMs} → ${EA[e].wallMs} ms |\n`;
fs.writeFileSync(path.join(__dirname, afterDir, "SUMMARY.md"), md);
console.log(md);
