import { describe, expect, it } from "vitest";
import type { SpendingMonthlyRow } from "@/lib/spending/analytics";
import { buildStackedSeries, OTHER_SERIES_ID, pickSeriesIds } from "./stacked-series";

const row = (ym: string, items: [string, number][]): SpendingMonthlyRow => {
  const byCategory = items.map(([id, amount]) => ({ id, label: id, amount }));
  return {
    ym,
    total: byCategory.reduce((s, r) => s + r.amount, 0),
    byCategory,
    byCard: [],
  };
};

// October is dominated by big one-off categories; November by everyday ones.
const monthly = [
  row("2026-10", [
    ["travel", 3000],
    ["family", 1200],
    ["food", 400],
    ["shopping", 350],
    ["living", 300],
    ["loans", 202],
    ["ilp", 300],
    ["subs", 25],
  ]),
  row("2026-11", [
    ["ilp", 300],
    ["work", 296],
    ["loans", 202],
    ["living", 145],
    ["transport", 124],
    ["food", 110],
    ["shopping", 102],
    ["insurance", 80],
    ["bnpl", 59],
    ["tax", 57],
    ["subs", 25],
  ]),
];

describe("pickSeriesIds", () => {
  it("keeps each month's top categories even when another month dominates the window", () => {
    const ids = pickSeriesIds(monthly, "byCategory", 6, 10);
    expect(ids).toContain("work");
    expect(ids).toContain("transport");
    expect(ids).toContain("travel");
    expect(ids.length).toBeLessThanOrEqual(10);
  });

  it("orders picked ids by window total", () => {
    const ids = pickSeriesIds(monthly, "byCategory", 6, 10);
    expect(ids[0]).toBe("travel");
    expect(ids[1]).toBe("family");
  });

  it("respects the cap, preferring ids with the highest single-month amount", () => {
    const ids = pickSeriesIds(monthly, "byCategory", 6, 3);
    expect(ids).toEqual(["travel", "family", "food"]);
  });
});

describe("buildStackedSeries", () => {
  it("folds the remainder into Other and lists its members per month", () => {
    const { series, otherMembers } = buildStackedSeries(monthly, "byCategory", 6, 10);
    const other = series.find((s) => s.id === OTHER_SERIES_ID);
    expect(other).toBeDefined();

    const novOther = otherMembers[1]!.map((m) => m.id);
    expect(novOther).not.toContain("work");
    expect(novOther).not.toContain("transport");
    expect(other!.data[1]).toBeCloseTo(
      otherMembers[1]!.reduce((s, m) => s + m.amount, 0),
      2,
    );

    // Every month's stack still sums to that month's total.
    monthly.forEach((m, i) => {
      const stacked = series.reduce((s, ser) => s + ser.data[i]!, 0);
      expect(stacked).toBeCloseTo(m.total, 2);
    });
  });

  it("omits Other when everything fits", () => {
    const small = [row("2026-11", [["a", 10], ["b", 5]])];
    const { series } = buildStackedSeries(small, "byCategory", 6, 10);
    expect(series.map((s) => s.id)).toEqual(["a", "b"]);
  });
});
