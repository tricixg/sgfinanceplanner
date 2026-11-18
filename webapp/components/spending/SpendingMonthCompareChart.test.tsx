// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/time/sgt", () => ({ sgtTodayYmd: () => "2026-11-18" }));

import { SpendingMonthCompareChart } from "./SpendingMonthCompareChart";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cat = (id: string, amount: number) => ({ id, label: id[0]!.toUpperCase() + id.slice(1), amount });

/** Two-month analytics bundle ending at `throughYm`. */
function bundle(throughYm: string) {
  const [y, m] = throughYm.split("-").map(Number) as [number, number];
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return {
    months: [prev, throughYm],
    scope: "discretionary",
    categoryOrder: ["shopping", "food", "travel", "others"],
    monthly: [
      { ym: prev, total: 0, byCategory: [cat("shopping", 1000), cat("food", 600), cat("others", 40)], byCard: [] },
      { ym: throughYm, total: 0, byCategory: [cat("shopping", 500), cat("food", 300), cat("travel", 80)], byCard: [] },
    ],
    perAccount: [],
    budgetByCategory: [],
    insights: { momChangePct: {}, topCategories: [], budgetVariance: [], momIncreases: [], cardShare: [] },
  };
}

let root: Root;
let host: HTMLDivElement;
let urls: string[];

beforeEach(() => {
  urls = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      const throughYm = new URL(url, "http://x").searchParams.get("throughYm")!;
      return new Response(JSON.stringify({ configured: true, analytics: bundle(throughYm) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};

describe("SpendingMonthCompareChart", () => {
  it("opens on the current month with last month as the marker", async () => {
    await act(async () => root.render(<SpendingMonthCompareChart scope="discretionary" />));
    await settle();

    expect(urls[0]).toContain("throughYm=2026-11");
    expect(urls[0]).toContain("months=2");
    expect(host.textContent).toContain("Bars are Nov 2026");
    expect(host.textContent).toContain("marker is Oct 2026");

    const rows = [...host.querySelectorAll(".month-compare-row")];
    expect(rows.map((r) => r.querySelector(".month-compare-label")!.textContent)).toEqual([
      "Shopping",
      "Food",
      "Travel",
      "Others",
    ]);
    // Scale is the largest of either month (1000): Shopping's bar is half, its marker at the end.
    const shop = rows[0]!;
    expect((shop.querySelector(".month-compare-bar") as HTMLElement).style.width).toBe("50%");
    expect((shop.querySelector(".month-compare-marker") as HTMLElement).style.left).toBe("100%");
    expect(shop.getAttribute("aria-label")).toContain("−50%");
    // Travel is new: a bar but no marker. Others was last month only: a marker but no bar.
    expect(rows[2]!.querySelector(".month-compare-marker")).toBeNull();
    expect(rows[3]!.querySelector(".month-compare-bar")).toBeNull();
    expect(rows[3]!.querySelector(".month-compare-marker")).not.toBeNull();
  });

  it("steps back a month, and can't step past the current month", async () => {
    await act(async () => root.render(<SpendingMonthCompareChart scope="discretionary" />));
    await settle();

    const next = host.querySelector('[aria-label^="Next month"]') as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    const prev = host.querySelector('[aria-label^="Previous month"]') as HTMLButtonElement;
    await act(async () => prev.click());
    await settle();

    expect(urls.at(-1)).toContain("throughYm=2026-10");
    expect(host.textContent).toContain("Bars are Oct 2026");
    expect(host.textContent).toContain("marker is Sep 2026");
  });
});
