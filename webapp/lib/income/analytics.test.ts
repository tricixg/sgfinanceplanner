import { describe, expect, it } from "vitest";
import { buildIncomeAnalytics } from "./analytics";

const categories = [
  { id: "cat-salary", name: "Salary" },
  { id: "cat-poker", name: "Poker" },
];

const accounts = [
  { id: "acct-dbs", name: "DBS Multiplier" },
  { id: "acct-uob", name: "UOB One" },
];

describe("buildIncomeAnalytics", () => {
  it("buckets deposits by month, category, and account", () => {
    const analytics = buildIncomeAnalytics({
      throughYm: "2026-03",
      months: 2,
      deposits: [
        {
          amount: 5000,
          occurredAt: "2026-02-05T00:00:00Z",
          incomeCategoryId: "cat-salary",
          accountId: "acct-dbs",
        },
        {
          amount: 200,
          occurredAt: "2026-03-10T00:00:00Z",
          incomeCategoryId: "cat-poker",
          accountId: "acct-uob",
        },
        {
          amount: 5100,
          occurredAt: "2026-03-05T00:00:00Z",
          incomeCategoryId: "cat-salary",
          accountId: "acct-dbs",
        },
      ],
      categories,
      accounts,
    });

    expect(analytics.months).toEqual(["2026-02", "2026-03"]);
    expect(analytics.monthly).toEqual([
      {
        ym: "2026-02",
        total: 5000,
        byCategory: [{ id: "cat-salary", label: "Salary", amount: 5000 }],
        byAccount: [{ id: "acct-dbs", label: "DBS Multiplier", amount: 5000 }],
      },
      {
        ym: "2026-03",
        total: 5300,
        byCategory: [
          { id: "cat-salary", label: "Salary", amount: 5100 },
          { id: "cat-poker", label: "Poker", amount: 200 },
        ],
        byAccount: [
          { id: "acct-dbs", label: "DBS Multiplier", amount: 5100 },
          { id: "acct-uob", label: "UOB One", amount: 200 },
        ],
      },
    ]);

    expect(analytics.insights.momChangePct["2026-03"]).toBe(6);
    expect(analytics.perAccount.map((a) => a.accountId)).toEqual(["acct-dbs", "acct-uob"]);
  });

  it("skips zero or negative deposits and rows outside the window", () => {
    const analytics = buildIncomeAnalytics({
      throughYm: "2026-03",
      months: 1,
      deposits: [
        { amount: 0, occurredAt: "2026-03-01T00:00:00Z", incomeCategoryId: "cat-salary" },
        { amount: -50, occurredAt: "2026-03-02T00:00:00Z", incomeCategoryId: "cat-salary" },
        { amount: 100, occurredAt: "2026-01-01T00:00:00Z", incomeCategoryId: "cat-salary" },
      ],
      categories,
      accounts,
    });

    expect(analytics.monthly).toEqual([{ ym: "2026-03", total: 0, byCategory: [], byAccount: [] }]);
  });

  it("falls back to Uncategorized / Unassigned labels when ids are missing", () => {
    const analytics = buildIncomeAnalytics({
      throughYm: "2026-03",
      months: 1,
      deposits: [{ amount: 75, occurredAt: "2026-03-15T00:00:00Z" }],
      categories,
      accounts,
    });

    expect(analytics.monthly[0]!.byCategory).toEqual([
      { id: "__uncategorized__", label: "Uncategorized", amount: 75 },
    ]);
    expect(analytics.monthly[0]!.byAccount).toEqual([
      { id: "__unassigned__", label: "Unassigned", amount: 75 },
    ]);
  });
});
