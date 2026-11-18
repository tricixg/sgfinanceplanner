// @vitest-environment jsdom
import { act, createElement, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDataProvider } from "@/contexts/AppDataProvider";
import { useAppData } from "@/hooks/useAppData";
import { useSavings } from "@/hooks/useSavings";
import { useAccounts } from "@/hooks/useAccounts";
import { useFunds } from "@/hooks/useFunds";
import { useHousehold } from "@/hooks/useHousehold";
import { useMiles } from "@/hooks/useMiles";
import { useBenefits } from "@/hooks/useBenefits";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { useOutstandingCardStatements } from "@/hooks/useOutstandingCardStatements";

/**
 * PERF-006 render counter. All nine providers live in one component, so any state update in
 * any of them used to hand every consumer of every context a brand-new value. These tests
 * count how often consumers re-render while the data loads and while a second page mounts
 * and starts loading its own domains.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BODY = {
  configured: true,
  data: { prefs: {} },
  profile: {},
  loans: [],
  otherLoans: [],
  months: {},
  income: {},
  computed: {},
  cards: [],
  holdings: [],
  accounts: [],
  funds: [],
  items: [],
  balances: [],
  benefits: [],
  usages: [],
  statements: [],
  snapshots: [],
  contributions: [],
  transactions: [],
  totals: {},
  pools: [],
  goals: [],
  members: [],
  sentInvites: [],
  receivedInvites: [],
  paired: false,
};

// Commits in which each consumer re-rendered (mount counts as 1): the effect has no
// dependency list, so it runs after every render of the consumer that reaches the DOM.
const counts: Record<string, number> = {};
function Hook({ name, use }: { name: string; use: () => unknown }) {
  use();
  useEffect(() => {
    counts[name] = (counts[name] ?? 0) + 1;
  });
  return null;
}
const probe = (name: string, use: () => unknown) => createElement(Hook, { key: name, name, use });

let pending = 0;
beforeEach(() => {
  for (const k of Object.keys(counts)) delete counts[k];
  pending = 0;
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      pending += 1;
      // Staggered answers, like real endpoints finishing one after another.
      await new Promise((r) => setTimeout(r, 5 + (i++ % 7) * 6));
      pending -= 1;
      return new Response(JSON.stringify(BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle() {
  for (let i = 0; i < 40; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
    if (pending === 0 && i > 3) break;
  }
}

function mount() {
  const el = document.createElement("div");
  const root = createRoot(el);
  const render = (kids: ReactNode) =>
    act(async () => {
      root.render(<AppDataProvider userId="u1">{kids}</AppDataProvider>);
    });
  return { render, unmount: () => act(async () => root.unmount()) };
}

describe("AppDataProvider re-renders (PERF-006)", () => {
  it("dashboard-like load: consumers render a bounded number of times", async () => {
    const app = mount();
    await app.render([
      probe("appData", useAppData),
      probe("savings", useSavings),
      probe("accounts", useAccounts),
      probe("funds", useFunds),
      probe("household", useHousehold),
      probe("miles", useMiles),
      probe("benefits", useBenefits),
      probe("financialAccounts", useFinancialAccounts),
      probe("outstanding", useOutstandingCardStatements),
    ]);
    await settle();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log("[render-count] dashboard load", JSON.stringify(counts), "total", total);
        await app.unmount();
    // Before the fix: 28-33 commits in total and 4-5 for each of savings, household,
    // financialAccounts and outstanding (they re-rendered on every other provider's update).
    // Now a lazily-loaded domain renders on mount and when its own data arrives.
    for (const name of Object.keys(counts).filter((n) => n !== "appData")) {
      expect(counts[name], name).toBeLessThanOrEqual(2);
    }
    expect(counts.appData).toBeLessThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(24);
  });

  it("navigating to a second page re-renders the first page's consumers as little as possible", async () => {
    const app = mount();
    const first = [probe("appData", useAppData), probe("savings", useSavings)];
    await app.render(first);
    await settle();
    const before = { ...counts };
    // "Navigate": a second page mounts consumers that lazily load their own domains.
    await app.render([
      ...first,
      probe("accounts", useAccounts),
      probe("funds", useFunds),
      probe("household", useHousehold),
      probe("benefits", useBenefits),
    ]);
    await settle();
    const extra = {
      appData: counts.appData - before.appData,
      savings: counts.savings - before.savings,
    };
    console.log("[render-count] navigation extra renders of page-one consumers", JSON.stringify(extra));
    await app.unmount();
    // Before the fix each of these re-rendered 3 times for data that never changed.
    expect(extra).toEqual({ appData: 0, savings: 0 });
  });
});
