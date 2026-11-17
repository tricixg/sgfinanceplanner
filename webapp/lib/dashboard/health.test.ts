import { describe, expect, it } from "vitest";
import type { SavingsGoal } from "@/lib/savings/types";
import {
  commitmentStatus,
  debtServiceStatus,
  goalProgress,
  netWorthChange,
  netWorthSeries,
  ratio,
  runwayMonths,
  runwayStatus,
  savingsRateStatus,
} from "./health";

describe("runway", () => {
  it("divides liquid cash by average monthly spending", () => {
    expect(runwayMonths(30000, 5000)).toBe(6);
  });

  it("is unknown without a spending baseline", () => {
    expect(runwayMonths(30000, 0)).toBeNull();
  });

  it("never goes negative", () => {
    expect(runwayMonths(-500, 1000)).toBe(0);
  });

  it("grades against the six- and three-month marks", () => {
    expect(runwayStatus(6)).toBe("good");
    expect(runwayStatus(3)).toBe("watch");
    expect(runwayStatus(2.9)).toBe("risk");
    expect(runwayStatus(null)).toBe("neutral");
  });
});

describe("ratios and their status", () => {
  it("needs income to mean anything", () => {
    expect(ratio(500, 0)).toBeNull();
    expect(ratio(500, 5000)).toBeCloseTo(0.1);
  });

  it("grades savings rate", () => {
    expect(savingsRateStatus(0.2)).toBe("good");
    expect(savingsRateStatus(0.1)).toBe("watch");
    expect(savingsRateStatus(-0.05)).toBe("risk");
    expect(savingsRateStatus(null)).toBe("neutral");
  });

  it("grades debt repayments", () => {
    expect(debtServiceStatus(0.2)).toBe("good");
    expect(debtServiceStatus(0.3)).toBe("watch");
    expect(debtServiceStatus(0.4)).toBe("risk");
  });

  it("grades recurring commitments", () => {
    expect(commitmentStatus(0.5)).toBe("good");
    expect(commitmentStatus(0.6)).toBe("watch");
    expect(commitmentStatus(0.8)).toBe("risk");
  });
});

describe("net worth history", () => {
  const history = [
    { month: "2026-10-01", lnw: 80000, cpf: 50000 },
    { month: "2025-11-01", lnw: 60000, cpf: 40000 },
    { month: "2026-09-01", lnw: 78000, cpf: 49000 },
  ];

  it("orders snapshots and applies the CPF toggle", () => {
    expect(netWorthSeries(history, false)).toEqual([
      { month: "2025-11", value: 60000 },
      { month: "2026-09", value: 78000 },
      { month: "2026-10", value: 80000 },
    ]);
    expect(netWorthSeries(history, true)[2]).toEqual({ month: "2026-10", value: 130000 });
  });

  it("compares with the latest snapshot at least a month old", () => {
    const change = netWorthChange(netWorthSeries(history, false), 82000, "2026-11", 1);
    expect(change).toMatchObject({ sinceYm: "2026-10", amount: 2000 });
    expect(change?.pct).toBeCloseTo(2.5);
  });

  it("looks back a year when asked", () => {
    const change = netWorthChange(netWorthSeries(history, false), 82000, "2026-11", 12);
    expect(change).toMatchObject({ sinceYm: "2025-11", amount: 22000 });
  });

  it("has nothing to compare when history is too short", () => {
    expect(netWorthChange([{ month: "2026-11", value: 82000 }], 82000, "2026-11", 1)).toBeNull();
  });

  it("handles a January look-back across the year boundary", () => {
    const change = netWorthChange(
      [{ month: "2025-12", value: 100 }],
      150,
      "2026-01",
      1
    );
    expect(change).toMatchObject({ sinceYm: "2025-12", amount: 50 });
  });
});

function goal(patch: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: "g",
    scope: "individual",
    ownerUserId: "u",
    householdId: null,
    name: "Goal",
    targetAmount: 12000,
    savedAmount: 6000,
    startDate: null,
    targetDate: "2027-05-01",
    monthlyContribution: 1000,
    splits: null,
    whereLabel: "",
    linkedAccountId: null,
    linkedPoolId: null,
    linkedFundId: null,
    sortOrder: 0,
    ...patch,
  };
}

describe("goalProgress", () => {
  it("works out what is needed each month to finish on time", () => {
    const p = goalProgress(goal({}), "2026-11");
    expect(p.progress).toBe(0.5);
    expect(p.monthsLeft).toBe(6);
    expect(p.neededPerMonth).toBe(1000);
    expect(p.onTrack).toBe(true);
  });

  it("flags a plan that falls short", () => {
    expect(goalProgress(goal({ monthlyContribution: 500 }), "2026-11").onTrack).toBe(false);
  });

  it("treats a reached target as on track with nothing more needed", () => {
    const p = goalProgress(goal({ savedAmount: 13000 }), "2026-11");
    expect(p.progress).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.onTrack).toBe(true);
  });

  it("flags an unreached goal whose date has passed", () => {
    const p = goalProgress(goal({ targetDate: "2026-10-01" }), "2026-11");
    expect(p.onTrack).toBe(false);
    expect(p.neededPerMonth).toBeNull();
  });

  it("makes no on-track call without a target date", () => {
    const p = goalProgress(goal({ targetDate: null }), "2026-11");
    expect(p.onTrack).toBeNull();
    expect(p.monthsLeft).toBeNull();
  });
});
