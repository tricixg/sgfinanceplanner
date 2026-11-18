// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppDataProvider } from "@/hooks/useAppData";
import { CORE_DOMAINS, type DataDomain } from "@/lib/app/domains";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Value = ReturnType<typeof useAppDataProvider>;
let latest: Value;
let requests: { url: string; method: string }[];
let failing: Set<string>;
/** When set, every mock response waits for it, so a test can observe the loading state deterministically. */
let hold: Promise<void> | null;

const BODIES: Record<string, unknown> = {
  "/api/state": { data: { prefs: { theme: "x" } } },
  "/api/profile": { configured: true, profile: { monthlySal: 5000 }, insurancePolicies: [], ilpPolicies: [] },
  "/api/loans": { configured: true, loans: [{ id: "l1" }] },
  "/api/other-loans": { configured: true, otherLoans: [] },
  "/api/budget-lines": { configured: true, months: {}, income: {}, computed: {} },
  "/api/credit-cards": { configured: true, cards: [{ id: "c1" }] },
  "/api/holdings": { configured: true, holdings: [{ id: "h1" }] },
  "/api/portfolio/snapshots": { items: [] },
  "/api/net-worth/snapshots": { items: [] },
  "/api/cpf/contributions": { items: [] },
  "/api/cpf/transactions": { items: [] },
};

beforeEach(() => {
  requests = [];
  failing = new Set();
  hold = null;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const path = url.split("?")[0];
      requests.push({ url: path, method: init?.method ?? "GET" });
      await new Promise((r) => setTimeout(r, 5));
      if (hold) await hold;
      const bad = failing.has(path);
      return new Response(JSON.stringify(bad ? { error: "boom" } : BODIES[path] ?? {}), {
        status: bad ? 500 : 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness({ needs }: { needs: readonly DataDomain[] }) {
  const v = useAppDataProvider(true, needs);
  useEffect(() => {
    latest = v;
  });
  return null;
}

async function mount(needs: readonly DataDomain[]) {
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(<Harness needs={needs} />);
  });
  const settle = async () => {
    for (let i = 0; i < 20; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 15))));
  };
  await settle();
  return { root, settle };
}
const gets = () => requests.filter((r) => r.method === "GET").map((r) => r.url).sort();

describe("domain-scoped loading (PERF-003)", () => {
  it("loads only the domains a route declared", async () => {
    await mount(["profile", "budget"]);
    expect(gets()).toEqual(["/api/budget-lines", "/api/profile"]);
    expect(latest.loading).toBe(false);
  });

  it("a route with no needs loads nothing and never shows a loading state", async () => {
    await mount([]);
    expect(requests).toHaveLength(0);
    expect(latest.loading).toBe(false);
  });

  it("loads each domain once however often it is requested", async () => {
    const m = await mount(["loans"]);
    await act(async () => latest.ensureDomains(["loans", "loans"]));
    await m.settle();
    expect(gets()).toEqual(["/api/loans"]);
  });

  it("waits (loading) until the declared core domains settle, then shows their real data", async () => {
    const root = createRoot(document.createElement("div"));
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    await act(async () => void root.render(<Harness needs={["loans"]} />));
    expect(latest.loading).toBe(true); // the response is held, however slow this machine is
    release();
    // Wait for the condition, not a fixed delay: a busy CI machine can take longer than 150 ms.
    await vi.waitFor(
      async () => {
        await act(async () => void (await new Promise((r) => setTimeout(r, 15))));
        expect(latest.loading).toBe(false);
      },
      { timeout: 5000, interval: 20 }
    );
    expect(latest.state.loans).toEqual([expect.objectContaining({ id: "l1" })]);
  });

  it("does not wait for secondary domains (placeholders instead)", async () => {
    const root = createRoot(document.createElement("div"));
    let release!: () => void;
    hold = new Promise<void>((r) => (release = r));
    await act(async () => void root.render(<Harness needs={["snapshots"]} />));
    // The request was sent and is held open, so this state can't come from a later tick.
    expect(gets()).toEqual(["/api/portfolio/snapshots"]);
    expect(latest.domainStatus.snapshots).toBe("loading");
    expect(latest.loading).toBe(false);
    expect(latest.snapshotsLoading).toBe(true); // still in flight: the response is held
    release();
    // Once it arrives, the placeholder clears.
    await vi.waitFor(
      async () => {
        await act(async () => void (await new Promise((r) => setTimeout(r, 15))));
        expect(latest.snapshotsLoading).toBe(false);
      },
      { timeout: 5000, interval: 20 }
    );
    expect(latest.state.portfolioHistory).toEqual([]);
    act(() => root.unmount());
  });

  it("reading a field of a domain nobody requested loads it instead of showing a default as real data", async () => {
    const m = await mount(["profile"]);
    expect(gets()).toEqual(["/api/profile"]);
    await act(async () => void latest.state.holdings); // a page reading data it never declared
    await m.settle();
    expect(gets()).toEqual(["/api/holdings", "/api/profile"]);
    expect(latest.state.holdings).toEqual([expect.objectContaining({ id: "h1" })]);
    // context-level fields too
    await act(async () => void latest.cpfContributions);
    await m.settle();
    expect(gets()).toContain("/api/cpf/contributions");
  });

  it("coreLoading (the net-worth snapshot gate) stays true until EVERY core domain has loaded", async () => {
    const m = await mount(["profile"]);
    expect(latest.loading).toBe(false); // this route is ready…
    expect(latest.coreLoading).toBe(true); // …but the snapshot must not be written from partial data
    await act(async () => latest.ensureDomains(CORE_DOMAINS));
    await m.settle();
    expect(latest.coreLoading).toBe(false);
  });

  it("refuses whole-list saves for a domain that has not loaded, and sends nothing", async () => {
    await mount(["profile"]);
    await expect(latest.saveLoans([])).rejects.toThrow(/haven't finished loading/);
    await expect(latest.saveCards([])).rejects.toThrow(/haven't finished loading/);
    await expect(latest.saveHoldings([])).rejects.toThrow(/haven't finished loading/);
    await expect(latest.savePrefs({})).rejects.toThrow(/haven't finished loading/);
    expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });

  it("refuses to save a domain whose load failed, and keeps the per-section error", async () => {
    failing.add("/api/credit-cards");
    await mount(["cards"]);
    expect(latest.domainStatus.cards).toBe("error");
    expect(latest.loadErrors.cards).toBe("Couldn't load credit cards");
    expect(latest.loading).toBe(false); // the page renders, with its retry banner
    await expect(latest.saveCards([])).rejects.toThrow();
    expect(requests.filter((r) => r.method !== "GET")).toHaveLength(0);
  });

  it("allows saves once the domain has loaded", async () => {
    await mount(["loans"]);
    await act(async () => void (await latest.saveLoans([{ id: "l1" } as never])));
    expect(requests.filter((r) => r.method === "PUT").map((r) => r.url)).toEqual(["/api/loans"]);
  });

  it("reload() refreshes only what was requested", async () => {
    const m = await mount(["loans", "cards"]);
    requests.length = 0;
    await act(async () => void (await latest.reload()));
    await m.settle();
    expect(gets()).toEqual(["/api/credit-cards", "/api/loans"]);
  });
});
