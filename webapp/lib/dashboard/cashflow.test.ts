import { describe, expect, it } from "vitest";
import {
  MAX_MONTHS_BACK,
  OTHER_ID,
  categoryTransactionsHref,
  chunksCovering,
  clampMonthYm,
  normaliseRangeKey,
  trendSubtitle,
  windowDateRange,
  mergeFlows,
  monthElapsed,
  pctChange,
  periodLabel,
  priorLabel,
  rangeWindow,
  summariseFlows,
  topWithOther,
  trendMonths,
} from "./cashflow";

describe("rangeWindow", () => {
  it("defaults the month view to the current month, compared with the month before", () => {
    expect(rangeWindow("month", "2026-11")).toEqual(rangeWindow("month", "2026-11", "2026-11"));
  });

  it("this month compares with the month before", () => {
    const w = rangeWindow("month", "2026-11");
    expect(w.months).toEqual(["2026-11"]);
    expect(w.prior).toEqual(["2026-10"]);
    expect(w.includesCurrentMonth).toBe(true);
  });

  it("last month excludes the month in progress", () => {
    const w = rangeWindow("month", "2026-01", "2025-12");
    expect(w.months).toEqual(["2025-12"]);
    expect(w.prior).toEqual(["2025-11"]);
    expect(w.includesCurrentMonth).toBe(false);
  });

  it("multi-month ranges end at the current month with an equal prior period", () => {
    const w = rangeWindow("3m", "2026-02");
    expect(w.months).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(w.prior).toEqual(["2025-09", "2025-10", "2025-11"]);
  });

  it("year to date spans January to the current month", () => {
    const w = rangeWindow("ytd", "2026-04");
    expect(w.months).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(w.prior).toEqual(["2025-09", "2025-10", "2025-11", "2025-12"]);
  });

  it("twelve months needs twenty-four months of data in total", () => {
    const w = rangeWindow("12m", "2026-11");
    expect(w.months).toHaveLength(12);
    expect(w.months[0]).toBe("2025-12");
    expect(w.prior[0]).toBe("2024-12");
  });
});

describe("trendMonths", () => {
  it("pads short ranges to six months ending now", () => {
    const months = trendMonths(rangeWindow("month", "2026-11", "2026-10"), "2026-11");
    expect(months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });

  it("shows the whole period for longer ranges", () => {
    expect(trendMonths(rangeWindow("12m", "2026-11"), "2026-11")).toHaveLength(12);
  });

  it("keeps a recent month inside the view that ends now", () => {
    const months = trendMonths(rangeWindow("month", "2026-11", "2026-06"), "2026-11");
    expect(months[months.length - 1]).toBe("2026-11");
    expect(months).toContain("2026-06");
  });

  it("ends at an older month so its bar is still shown", () => {
    const months = trendMonths(rangeWindow("month", "2026-11", "2025-09"), "2026-11");
    expect(months).toEqual(["2025-04", "2025-05", "2025-06", "2025-07", "2025-08", "2025-09"]);
  });
});

describe("trendSubtitle", () => {
  it("says last N months when the plot ends now", () => {
    expect(trendSubtitle(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"], "2026-11")).toBe(
      "Last 6 months"
    );
  });

  it("names the span when the plot ends earlier", () => {
    expect(trendSubtitle(["2025-04", "2025-09"], "2026-11")).toBe("Apr – Sep 2025");
    expect(trendSubtitle(["2024-11", "2025-04"], "2026-11")).toBe("Nov 2024 – Apr 2025");
  });
});

describe("clampMonthYm", () => {
  it("accepts months from the current one back to the limit", () => {
    expect(clampMonthYm("2026-11", "2026-11")).toBe("2026-11");
    expect(clampMonthYm("2024-11", "2026-11")).toBe("2024-11");
    expect(MAX_MONTHS_BACK).toBe(24);
  });

  it("rejects future, too-old and malformed values", () => {
    expect(clampMonthYm("2026-12", "2026-11")).toBeNull();
    expect(clampMonthYm("2024-10", "2026-11")).toBeNull();
    expect(clampMonthYm("2026-13", "2026-11")).toBeNull();
    expect(clampMonthYm("nov", "2026-11")).toBeNull();
    expect(clampMonthYm(null, "2026-11")).toBeNull();
  });
});

describe("normaliseRangeKey", () => {
  it("maps retired single-month keys to the month view", () => {
    expect(normaliseRangeKey("this-month")).toBe("month");
    expect(normaliseRangeKey("last-month")).toBe("month");
    expect(normaliseRangeKey("ytd")).toBe("ytd");
    expect(normaliseRangeKey("bogus")).toBeNull();
    expect(normaliseRangeKey(null)).toBeNull();
  });
});

describe("windowDateRange", () => {
  it("covers whole calendar months", () => {
    expect(windowDateRange(rangeWindow("month", "2026-11"))).toEqual({
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
    });
    expect(windowDateRange(rangeWindow("month", "2026-11", "2024-02"))).toEqual({
      dateFrom: "2024-02-01",
      dateTo: "2024-02-29",
    });
    expect(windowDateRange(rangeWindow("3m", "2026-01"))).toEqual({
      dateFrom: "2025-11-01",
      dateTo: "2026-01-31",
    });
  });
});

describe("categoryTransactionsHref", () => {
  const w = rangeWindow("month", "2026-11");

  it("filters by the category label and the period", () => {
    const href = categoryTransactionsHref({ id: "line-1", label: "Food & drinks" }, w, "/dashboard");
    const url = new URL(href, "https://x.test");
    expect(url.pathname).toBe("/transactions");
    expect(url.searchParams.get("category")).toBe("Food & drinks");
    expect(url.searchParams.get("dateFrom")).toBe("2026-11-01");
    expect(url.searchParams.get("dateTo")).toBe("2026-11-30");
    expect(url.searchParams.get("back")).toBe("/dashboard");
  });

  it("uses the uncategorized filter for uncategorized spend", () => {
    const href = categoryTransactionsHref({ id: "__uncategorized__", label: "Uncategorized" }, w);
    const url = new URL(href, "https://x.test");
    expect(url.searchParams.get("category")).toBe("__uncategorized__");
    expect(url.searchParams.has("back")).toBe(false);
  });

  it("keeps the month the dashboard was on in the return link", () => {
    const href = categoryTransactionsHref(
      { id: "a", label: "A" },
      rangeWindow("month", "2026-11", "2026-09"),
      "/dashboard?month=2026-09"
    );
    expect(new URL(href, "https://x.test").searchParams.get("back")).toBe("/dashboard?month=2026-09");
  });
});

describe("chunksCovering", () => {
  it("uses one six-month request when that is enough", () => {
    expect(chunksCovering("2026-06", "2026-11")).toEqual([{ throughYm: "2026-11", months: 6 }]);
  });

  it("adds earlier fixed windows until the earliest month is covered", () => {
    expect(chunksCovering("2024-12", "2026-11")).toEqual([
      { throughYm: "2026-11", months: 6 },
      { throughYm: "2026-05", months: 6 },
      { throughYm: "2025-11", months: 6 },
      { throughYm: "2025-05", months: 6 },
    ]);
  });

  it("reaches the comparison month of the oldest steppable month", () => {
    const chunks = chunksCovering("2024-10", "2026-11");
    const oldest = chunks[chunks.length - 1]!;
    expect(chunks).toHaveLength(5);
    expect(oldest.throughYm <= "2024-11").toBe(true);
  });

  it("keeps window boundaries stable so responses can be reused", () => {
    const short = chunksCovering("2026-09", "2026-11");
    const long = chunksCovering("2026-03", "2026-11");
    expect(long[0]).toEqual(short[0]);
  });
});

const spending = {
  monthly: [
    {
      ym: "2026-10",
      total: 300,
      byCategory: [
        { id: "food", label: "Food", amount: 200 },
        { id: "bus", label: "Transport", amount: 100 },
      ],
      byCard: [],
    },
    {
      ym: "2026-11",
      total: 150,
      byCategory: [{ id: "food", label: "Food", amount: 150 }],
      byCard: [],
    },
  ],
};
const income = {
  monthly: [
    { ym: "2026-10", total: 1000, byCategory: [{ id: "sal", label: "Salary", amount: 1000 }], byAccount: [] },
    { ym: "2026-11", total: 0, byCategory: [], byAccount: [] },
  ],
};

describe("mergeFlows / summariseFlows", () => {
  const flows = mergeFlows([spending], [income]);

  it("joins income and spending by month", () => {
    expect(flows.get("2026-10")).toMatchObject({ income: 1000, spending: 300 });
    expect(flows.get("2026-11")).toMatchObject({ income: 0, spending: 150 });
  });

  it("totals a period and derives net and savings rate", () => {
    const s = summariseFlows(flows, ["2026-10", "2026-11"]);
    expect(s.income).toBe(1000);
    expect(s.spending).toBe(450);
    expect(s.net).toBe(550);
    expect(s.savingsRate).toBeCloseTo(0.55);
    expect(s.activeMonths).toBe(2);
  });

  it("sums categories across months, largest first", () => {
    const s = summariseFlows(flows, ["2026-10", "2026-11"]);
    expect(s.spendingByCategory).toEqual([
      { id: "food", label: "Food", amount: 350 },
      { id: "bus", label: "Transport", amount: 100 },
    ]);
  });

  it("reports no savings rate when there is no income", () => {
    const s = summariseFlows(flows, ["2026-11"]);
    expect(s.net).toBe(-150);
    expect(s.savingsRate).toBeNull();
  });

  it("treats months without data as zero rather than failing", () => {
    const s = summariseFlows(flows, ["2026-08", "2026-09"]);
    expect(s).toMatchObject({ income: 0, spending: 0, net: 0, activeMonths: 0 });
  });

  it("later responses for the same month replace earlier ones", () => {
    const refreshed = mergeFlows(
      [spending, { monthly: [{ ym: "2026-11", total: 175, byCategory: [], byCard: [] }] }],
      [income]
    );
    expect(refreshed.get("2026-11")?.spending).toBe(175);
  });
});

describe("pctChange", () => {
  it("is relative to the earlier figure", () => {
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, 100)).toBeCloseTo(-20);
  });

  it("is undefined without a positive baseline", () => {
    expect(pctChange(50, 0)).toBeNull();
    expect(pctChange(50, -10)).toBeNull();
  });
});

describe("topWithOther", () => {
  const rows = [
    { id: "a", label: "A", amount: 50 },
    { id: "b", label: "B", amount: 30 },
    { id: "c", label: "C", amount: 15 },
    { id: "d", label: "D", amount: 5 },
  ];

  it("rolls the tail into Other and keeps shares of the full total", () => {
    const out = topWithOther(rows, 2);
    expect(out.map((r) => r.label)).toEqual(["A", "B", "Other (2)"]);
    expect(out[2]!.amount).toBe(20);
    expect(out[2]!.id).toBe(OTHER_ID);
    expect(out[2]!.children?.map((r) => r.label)).toEqual(["C", "D"]);
    expect(out[2]!.children?.[0]!.share).toBeCloseTo(0.15);
    expect(out.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1);
  });

  it("names a single leftover row instead of calling it Other", () => {
    expect(topWithOther(rows, 3).map((r) => r.label)).toEqual(["A", "B", "C", "D"]);
    // …and keeps its own id, so it links to its own transactions.
    expect(topWithOther(rows, 3)[3]!.id).toBe("d");
  });

  it("returns nothing when there is nothing to rank", () => {
    expect(topWithOther([], 5)).toEqual([]);
  });
});

describe("labels", () => {
  it("describes the month in progress up to today", () => {
    expect(periodLabel(rangeWindow("month", "2026-11"), "2026-11-17")).toBe("1–17 Nov 2026");
  });

  it("names a completed month", () => {
    expect(periodLabel(rangeWindow("month", "2026-11", "2026-10"), "2026-11-17")).toBe("Oct 2026");
  });

  it("marks multi-month ranges that include the current month as to date", () => {
    expect(periodLabel(rangeWindow("3m", "2026-11"), "2026-11-17")).toBe("Sep – Nov 2026 to date");
  });

  it("spells out both years when a range crosses new year", () => {
    expect(periodLabel(rangeWindow("3m", "2026-01"), "2026-01-09")).toBe(
      "Nov 2025 – Jan 2026 to date"
    );
  });

  it("labels the comparison period", () => {
    expect(priorLabel(rangeWindow("month", "2026-11"))).toBe("Oct");
    expect(priorLabel(rangeWindow("3m", "2026-11"))).toBe("Jun – Aug");
  });
});

describe("monthElapsed", () => {
  it("is the share of days gone", () => {
    expect(monthElapsed("2026-11-15")).toBeCloseTo(0.5);
    expect(monthElapsed("2026-02-28")).toBe(1);
  });
});
