import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/lib/nav-config";
import {
  ALL_DOMAINS,
  CORE_DOMAINS,
  DATA_DOMAINS,
  STATE_FIELD_DOMAIN,
  domainsForPath,
  routeDomainTable,
} from "@/lib/app/domains";

const table = routeDomainTable();

describe("route domain table (PERF-003)", () => {
  it("has an explicit entry for every page in the navigation", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.href));
    expect(hrefs.length).toBeGreaterThan(20);
    for (const href of hrefs) expect(table, href).toHaveProperty([href]);
  });

  it("only names real domains", () => {
    for (const [route, domains] of Object.entries(table)) {
      for (const d of domains) expect(DATA_DOMAINS, `${route} -> ${d}`).toContain(d);
    }
  });

  it("unknown routes and dynamic children load everything (fail safe)", () => {
    expect(domainsForPath("/travel/123")).toEqual(ALL_DOMAINS);
    expect(domainsForPath("/some-new-page")).toEqual(ALL_DOMAINS);
    expect(domainsForPath(null)).toEqual(ALL_DOMAINS);
    expect(domainsForPath("/expenses/")).toEqual([]); // trailing slash tolerated
  });

  it("cash-accounts declares every core domain, or the net-worth snapshot gate could never open", () => {
    for (const d of CORE_DOMAINS) expect(table["/cash-accounts"]).toContain(d);
  });

  it("declares at least every domain a page was recorded reading (documentation/audit/perf-harness/domain-reads.json)", () => {
    const file = path.resolve(__dirname, "../../../documentation/audit/perf-harness/domain-reads.json");
    const recorded = JSON.parse(readFileSync(file, "utf8")) as Record<string, Record<string, string[]>>;
    expect(Object.keys(recorded).length).toBeGreaterThan(20);
    for (const [route, reads] of Object.entries(recorded)) {
      for (const domain of Object.keys(reads).filter((k) => k !== "__pageErrors")) {
        expect(table[route], `${route} reads ${domain}`).toContain(domain);
      }
    }
  });

  it("the state-field map only points at real domains", () => {
    for (const d of Object.values(STATE_FIELD_DOMAIN)) expect(DATA_DOMAINS).toContain(d);
  });
});
