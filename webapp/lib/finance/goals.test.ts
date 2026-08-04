import { describe, expect, it } from "vitest";
import type { SavingsGoal } from "@/lib/savings/types";
import {
  computedSavingsMonthly,
  COMPUTED_SAVINGS_LABEL,
} from "./budget";
import { goalsSummary, monthlySavingNeeded } from "./goals";

const goal = (partial: Partial<SavingsGoal>): SavingsGoal => ({
  id: "g1",
  scope: "individual",
  ownerUserId: "u1",
  householdId: null,
  name: "Trip",
  targetAmount: 12000,
  savedAmount: 0,
  startDate: null,
  targetDate: "2027-01-01",
  monthlyContribution: 0,
  splits: null,
  whereLabel: "",
  linkedAccountId: null,
  linkedPoolId: null,
  linkedFundId: null,
  sortOrder: 0,
  ...partial,
});

describe("monthlySavingNeeded", () => {
  it("returns null when target date is empty", () => {
    expect(monthlySavingNeeded(goal({ targetDate: null }))).toBeNull();
  });

  it("computes gap divided by months until target", () => {
    const need = monthlySavingNeeded(
      goal({ targetAmount: 12000, savedAmount: 0, targetDate: "2027-01-01" }),
      "2026-05"
    );
    expect(need).not.toBeNull();
    expect(need!).toBeGreaterThan(0);
  });
});

describe("computedSavingsMonthly", () => {
  it("sums each goal's monthlyContribution", () => {
    const total = computedSavingsMonthly(
      [
        goal({ monthlyContribution: 500 }),
        goal({ id: "g2", name: "Open", monthlyContribution: 300 }),
      ],
      undefined,
      "2026-05"
    );
    expect(total).toBe(800);
    expect(
      computedSavingsMonthly([goal({ monthlyContribution: 0 })], undefined, "2026-05")
    ).toBe(0);
  });

  it("reflects a manually edited monthlyContribution, not a recomputed need", () => {
    // Same target/dates, only monthlyContribution differs — total must track the field.
    const g1 = goal({ targetAmount: 12000, targetDate: "2027-01-01", monthlyContribution: 200 });
    const g2 = { ...g1, monthlyContribution: 900 };
    expect(computedSavingsMonthly([g1], undefined, "2026-05")).toBe(200);
    expect(computedSavingsMonthly([g2], undefined, "2026-05")).toBe(900);
  });

  it("excludes goals whose startDate is in the future", () => {
    const futureStart = goal({
      monthlyContribution: 400,
      startDate: "2027-01-01",
    });
    expect(computedSavingsMonthly([futureStart], undefined, "2026-05")).toBe(0);
  });

  it("includes goals whose startDate is in the past", () => {
    const pastStart = goal({
      monthlyContribution: 400,
      startDate: "2025-01-01",
    });
    expect(computedSavingsMonthly([pastStart], undefined, "2026-05")).toBe(400);
  });

  it("uses split amount for shared goals when myUserId matches", () => {
    const sharedGoal = goal({
      scope: "shared",
      ownerUserId: null,
      householdId: "hh1",
      targetAmount: 12000,
      targetDate: "2027-01-01",
      monthlyContribution: 1000,
      splits: { "user-me": 400, "user-partner": 600 },
    });
    const myShare = computedSavingsMonthly([sharedGoal], "user-me", "2026-05");
    expect(myShare).toBe(400);
    const partnerShare = computedSavingsMonthly([sharedGoal], "user-partner", "2026-05");
    expect(partnerShare).toBe(600);
  });

  it("falls back to 50% of monthlyContribution for shared goals with no splits", () => {
    const sharedGoal = goal({
      scope: "shared",
      ownerUserId: null,
      householdId: "hh1",
      monthlyContribution: 1000,
      splits: null,
    });
    const myShare = computedSavingsMonthly([sharedGoal], "user-me", "2026-05");
    expect(myShare).toBe(500);
  });
});

describe("goalsSummary", () => {
  it("skips need/mo for goals without by date", () => {
    const { rows, totMonthly } = goalsSummary(
      { goals: [
          { name: "A", target: 1000, saved: 0, by: "", where: "" },
          { name: "B", target: 12000, saved: 0, by: "2027-01", where: "" },
        ] } as Parameters<typeof goalsSummary>[0],
      "2026-05"
    );
    expect(rows[0].need).toBe(0);
    expect(rows[1].need).toBeGreaterThan(0);
    expect(totMonthly).toBe(rows[1].need);
  });
});

describe("COMPUTED_SAVINGS_LABEL", () => {
  it("is defined for budget UI", () => {
    expect(COMPUTED_SAVINGS_LABEL).toContain("Savings");
  });
});
