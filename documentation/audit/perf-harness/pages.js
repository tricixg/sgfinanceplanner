// Load each route with a forged local session against the mock Supabase and record
// request waterfall, bytes, and time until loading placeholders disappear.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3100";
const cookieStr = fs.readFileSync(path.join(__dirname, "cookie.txt"), "utf8");
const [cName, ...rest] = cookieStr.split("=");
const cValue = rest.join("=");
const ROUTES = (process.env.ROUTES || "").split(",").filter(Boolean);
const CPU = Number(process.env.CPU_THROTTLE || 4);

(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies([{ name: cName, value: cValue, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    const reqs = new Map();
    const t0 = Date.now();
    cdp.on("Network.requestWillBeSent", (e) => {
      reqs.set(e.requestId, { url: e.request.url, type: e.type, start: Date.now() - t0, bytes: 0 });
    });
    cdp.on("Network.loadingFinished", (e) => {
      const r = reqs.get(e.requestId);
      if (r) { r.end = Date.now() - t0; r.bytes = e.encodedDataLength; }
    });
    await page.goto(BASE + route, { waitUntil: "load" });
    // usable = no loading placeholders for 500ms and network quiet
    let usableAt = null;
    const deadline = Date.now() + 9000;
    let quietSince = null;
    while (Date.now() < deadline) {
      const loading = await page.evaluate(() => {
        const sel = ".loading, .skeleton, [aria-busy='true']";
        const els = [...document.querySelectorAll(sel)].filter((el) => el.offsetParent !== null);
        const txt = document.body.innerText;
        return els.length > 0 || /Checking access|Loading…|Loading\.\.\./.test(txt);
      });
      const pending = [...reqs.values()].filter((r) => r.end == null && !r.url.startsWith("data:")).length;
      if (!loading && pending === 0) {
        if (quietSince == null) quietSince = Date.now() - t0;
        if (Date.now() - t0 - quietSince > 500) { usableAt = quietSince; break; }
      } else quietSince = null;
      await page.waitForTimeout(50);
    }
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { dcl: n?.domContentLoadedEventEnd, load: n?.loadEventEnd, fcp: fcp?.startTime };
    });
    const list = [...reqs.values()];
    const api = list.filter((r) => r.url.includes("/api/"));
    const js = list.filter((r) => r.type === "Script");
    const css = list.filter((r) => r.type === "Stylesheet");
    const apiCounts = {};
    for (const a of api) {
      const k = new URL(a.url).pathname + (new URL(a.url).search ? "?" : "");
      apiCounts[k] = (apiCounts[k] || 0) + 1;
    }
    const dupes = Object.entries(apiCounts).filter(([, n]) => n > 1);
    out.push({
      route,
      fcp: Math.round(nav.fcp || 0),
      usable: usableAt,
      requests: list.length,
      apiRequests: api.length,
      firstApiStart: Math.min(...api.map((a) => a.start)),
      lastApiEnd: Math.max(...api.map((a) => a.end || 0)),
      jsCount: js.length,
      jsKB: Math.round(js.reduce((s, r) => s + r.bytes, 0) / 1024),
      cssKB: Math.round(css.reduce((s, r) => s + r.bytes, 0) / 1024),
      totalKB: Math.round(list.reduce((s, r) => s + r.bytes, 0) / 1024),
      dupes,
      waterfall: api.map((a) => `${a.start}-${a.end} ${new URL(a.url).pathname}`),
    });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, process.env.OUT || "pages.json"), JSON.stringify(out, null, 2));
  for (const r of out) {
    console.log(
      [r.route, "fcp", r.fcp, "usable", r.usable, "req", r.requests, "api", r.apiRequests,
       "api1st", r.firstApiStart, "apiLast", r.lastApiEnd, "js", r.jsCount + "/" + r.jsKB + "KB",
       "css", r.cssKB + "KB", "tot", r.totalKB + "KB", "dupes", JSON.stringify(r.dupes)].join(" ")
    );
  }
})();
