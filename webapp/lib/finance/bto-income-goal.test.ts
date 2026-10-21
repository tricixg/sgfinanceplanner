import { describe, expect, it } from "vitest";
import { btoIncomeGoal } from "./bto-income-goal";
import { computeBTO } from "./bto";
import { cpfOAmonthly } from "./cpf";

// Mirrors the prototype: $640k flat, $420k HFE loan, $10k grant, today Oct 2026,
// AFL in 10 months, keys Sep 2031 (59 months).
const inputs = {
  price: 640000,
  rate: 2.6,
  tenure: 25,
  bookingOffsetMonths: 1,
  aflOffsetMonths: 10,
  kcOffsetMonths: 59,
  latestKcOffsetMonths: 77,
  optionFee: 2000,
  legalFee: 650,
  staggered: false,
  maxLoanEligible: 420000,
  schemes: { ehg: { enabled: true, amountOverride: 10000 } },
  tSal: 6500,
  pSal: 4300,
  tOA: 30000,
  pOA: 14575,
  tOAMonthly: cpfOAmonthly(6500),
  pOAMonthly: cpfOAmonthly(4300),
};
const TODAY_YM = "2026-10";

describe("btoIncomeGoal", () => {
  const goal = btoIncomeGoal(inputs, TODAY_YM);

  it("needs a raise when today's income can't cover the keys bill", () => {
    expect(computeBTO(inputs).dpOK).toBe(false);
    expect(goal.raiseNeeded).toBe(true);
    expect(goal.keysYear).toBe(2031);
  });

  it("finds a steady yearly raise that just covers the keys bill", () => {
    if (!goal.yearly.reachable) throw new Error("expected reachable");
    expect(goal.yearly.growthPct).toBeGreaterThan(3);
    expect(goal.yearly.growthPct).toBeLessThan(10);
    const years = goal.yearly.years;
    expect(years[0].year).toBe(2026);
    expect(years[0].income).toBeCloseTo(10800, 5);
    expect(years.at(-1)!.year).toBe(2031);
    // Income rises every year, and OA at keys lands on the bill.
    for (let i = 1; i < years.length; i++) {
      expect(years[i].income).toBeGreaterThanOrEqual(years[i - 1].income);
    }
    expect(years.at(-1)!.balance).toBeCloseTo(computeBTO(inputs).neededKC, -1);
  });

  it("needs a bigger one-off raise the later it comes, until it's too late", () => {
    const reachable = goal.oneRaise.filter((r) => r.reachable);
    expect(goal.oneRaise[0].year).toBe(2027);
    expect(reachable.length).toBeGreaterThan(0);
    for (let i = 1; i < reachable.length; i++) {
      expect(reachable[i].income).toBeGreaterThan(reachable[i - 1].income);
    }
    // The last January before keys leaves too few months to catch up.
    expect(goal.oneRaise.at(-1)!.reachable).toBe(false);
  });

  it("a one-off raise from Jan 2027 is enough on its own", () => {
    const first = goal.oneRaise[0];
    if (!first.reachable) throw new Error("expected reachable");
    expect(first.income).toBeGreaterThan(10800);
    expect(first.raisePct).toBeCloseTo((first.income / 10800 - 1) * 100, 5);
  });

  it("reports no raise needed when CPF already covers keys", () => {
    const cheap = btoIncomeGoal({ ...inputs, price: 450000, maxLoanEligible: 0 }, TODAY_YM);
    expect(cheap.raiseNeeded).toBe(false);
    expect(cheap.oneRaise).toHaveLength(0);
  });

  it("says when even capped salaries can't get there", () => {
    const huge = btoIncomeGoal({ ...inputs, price: 800000, maxLoanEligible: 100000 }, TODAY_YM);
    expect(huge.yearly.reachable).toBe(false);
    expect(huge.oneRaise.every((r) => !r.reachable)).toBe(true);
  });
});
