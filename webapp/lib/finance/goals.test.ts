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
  targetDate: "2027-01-01",
  monthlyContribution: 0,
  whereLabel: "",
  linkedAccountId: null,
  linkedPoolId: null,
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
  it("sums only goals with a target date", () => {
    const total = computedSavingsMonthly(
      [
        goal({ targetAmount: 6000, targetDate: "2027-01-01" }),
        goal({ id: "g2", name: "Open", targetDate: null }),
      ],
      "2026-05"
    );
    expect(total).toBeGreaterThan(0);
    expect(
      computedSavingsMonthly([goal({ targetDate: null })], "2026-05")
    ).toBe(0);
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
