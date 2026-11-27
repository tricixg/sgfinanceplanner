import { describe, expect, it } from "vitest";
import { buildInterestAnalytics, sliceInterestAnalytics } from "./analytics";

const accounts = [
  { id: "acct-dbs", name: "DBS Multiplier" },
  { id: "acct-uob", name: "UOB One" },
];

const dep = (amount: number, occurredAt: string, accountId: string, incomeCategoryId = "int") => ({
  amount,
  occurredAt,
  accountId,
  incomeCategoryId,
});

describe("buildInterestAnalytics", () => {
  it("groups interest by month and account, with cumulative totals and KPIs", () => {
    const out = buildInterestAnalytics({
      throughYm: "2026-03",
      months: 3,
      accounts,
      interestCategoryId: "int",
      deposits: [
        dep(10, "2026-01-31T10:00:00Z", "acct-dbs"),
        dep(25.5, "2026-02-28T10:00:00Z", "acct-uob"),
        dep(4.5, "2026-02-28T11:00:00Z", "acct-dbs"),
        dep(30, "2026-03-31T10:00:00Z", "acct-uob"),
        // Not interest, outside window, or non-positive → ignored.
        dep(5000, "2026-03-01T00:00:00Z", "acct-dbs", "salary"),
        dep(99, "2025-12-31T00:00:00Z", "acct-dbs"),
        dep(-3, "2026-03-15T00:00:00Z", "acct-dbs"),
      ],
    });

    expect(out.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(out.monthly.map((m) => m.total)).toEqual([10, 30, 30]);
    expect(out.monthly[1]!.byAccount).toEqual([
      { id: "acct-uob", label: "UOB One", amount: 25.5 },
      { id: "acct-dbs", label: "DBS Multiplier", amount: 4.5 },
    ]);
    expect(out.cumulative).toEqual([10, 40, 70]);
    // Account-list order (stable colours), not ranked by total.
    expect(out.accounts.map((a) => [a.id, a.total, a.order])).toEqual([
      ["acct-dbs", 14.5, 0],
      ["acct-uob", 55.5, 1],
    ]);
    expect(out.kpis).toEqual({
      total: 70,
      avgPerMonth: 23.33,
      topAccount: { id: "acct-uob", label: "UOB One", total: 55.5 },
      latestMonth: 30,
    });
  });

  it("returns an empty, zero-filled window without an Interest category", () => {
    const out = buildInterestAnalytics({
      throughYm: "2026-03",
      months: 2,
      accounts,
      interestCategoryId: null,
      deposits: [dep(10, "2026-03-01T00:00:00Z", "acct-dbs")],
    });
    expect(out.monthly.map((m) => m.total)).toEqual([0, 0]);
    expect(out.cumulative).toEqual([0, 0]);
    expect(out.accounts).toEqual([]);
    expect(out.kpis.topAccount).toBeNull();
  });
});

describe("sliceInterestAnalytics", () => {
  const full = buildInterestAnalytics({
    throughYm: "2026-03",
    months: 3,
    accounts,
    interestCategoryId: "int",
    deposits: [
      dep(10, "2026-01-31T10:00:00Z", "acct-dbs"),
      dep(25.5, "2026-02-28T10:00:00Z", "acct-uob"),
      dep(30, "2026-03-31T10:00:00Z", "acct-uob"),
    ],
  });

  it("matches building the narrower window directly", () => {
    const sliced = sliceInterestAnalytics(full, 2);
    const direct = buildInterestAnalytics({
      throughYm: "2026-03",
      months: 2,
      accounts,
      interestCategoryId: "int",
      deposits: [
        dep(10, "2026-01-31T10:00:00Z", "acct-dbs"),
        dep(25.5, "2026-02-28T10:00:00Z", "acct-uob"),
        dep(30, "2026-03-31T10:00:00Z", "acct-uob"),
      ],
    });
    expect(sliced).toEqual(direct);
  });

  it("returns the bundle unchanged when the range covers it", () => {
    expect(sliceInterestAnalytics(full, 24)).toBe(full);
  });
});
