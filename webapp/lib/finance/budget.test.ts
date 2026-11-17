import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  budgetFixedTotal,
  budgetLinesForMonth,
  COMPUTED_DEBT_LABEL,
  computedDebtMonthly,
  isDebtBudgetCategory,
  monthlyInvestContribution,
  monthlyInvestContributionWithIlp,
  monthlySaveContribution,
} from "./budget";
import { defaultIlpPolicy } from "./ilp";
import { loanLoadForMonth } from "./loanLoad";
import { currentYm, monIdx, ymFromMonIdx } from "./helpers";
import { takeHomeForMonth } from "./income";

describe("monthlyInvestContribution", () => {
  it("sums invest-type budget lines", () => {
    expect(monthlyInvestContribution(DEFAULTS)).toBe(1300);
    expect(monthlySaveContribution(DEFAULTS)).toBe(900);
  });

  it("WithIlp adds ILP premiums on top of invest lines", () => {
    const S = {
      ...DEFAULTS,
      ilpPolicies: [{ ...defaultIlpPolicy(), monthlyPremium: 300 }],
    };
    expect(monthlyInvestContributionWithIlp(S)).toBe(monthlyInvestContribution(S) + 300);
  });
});

describe("computedDebtMonthly", () => {
  it("uses current month, not cashflowStartYm", () => {
    const expected = loanLoadForMonth(DEFAULTS.loans, currentYm());
    expect(expected).toBeGreaterThan(0);

    expect(
      computedDebtMonthly({
        ...DEFAULTS,
        cashflowStartYm: "",
      })
    ).toBe(expected);

    expect(
      computedDebtMonthly({
        ...DEFAULTS,
        cashflowStartYm: "2030-01",
      })
    ).toBe(expected);
  });
});

describe("isDebtBudgetCategory", () => {
  it("detects computed debt label and loan-like categories", () => {
    expect(isDebtBudgetCategory(COMPUTED_DEBT_LABEL)).toBe(true);
    expect(isDebtBudgetCategory("Card instalment plans")).toBe(true);
    expect(isDebtBudgetCategory("Household")).toBe(false);
  });

  it("excludes debt-like fixed lines from budgetFixedTotal", () => {
    const withDup = {
      ...DEFAULTS,
      budget: [
        ...DEFAULTS.budget,
        { cat: COMPUTED_DEBT_LABEL, amt: 999, type: "fixed" as const },
      ],
    };
    expect(budgetFixedTotal(withDup)).toBe(budgetFixedTotal(DEFAULTS));
  });
});

describe("per-month budgets", () => {
  const S = {
    ...DEFAULTS,
    budgetMonths: {
      "2026-11": [{ id: "a", cat: "Rent", amt: 100, type: "fixed" as const }],
      "2026-12": [{ id: "a", cat: "Rent", amt: 250, type: "fixed" as const }],
    },
  };
  it("budgetFixedTotal resolves each month", () => {
    expect(budgetFixedTotal(S, "2026-11")).toBe(100);
    expect(budgetFixedTotal(S, "2026-12")).toBe(250);
    expect(budgetFixedTotal(S, "2027-03")).toBe(250);
  });
  it("without a month it uses S.budget", () => {
    const expected = DEFAULTS.budget
      .filter((b) => b.type === "fixed" && !isDebtBudgetCategory(b.cat))
      .reduce((s, b) => s + b.amt, 0);
    expect(budgetFixedTotal(S)).toBe(expected);
  });
  it("budgetLinesForMonth falls back to S.budget without budgetMonths", () => {
    expect(budgetLinesForMonth(DEFAULTS, "2026-12")).toBe(DEFAULTS.budget);
  });
  it("ymFromMonIdx inverts monIdx", () => {
    expect(ymFromMonIdx(monIdx("2026-12"))).toBe("2026-12");
    expect(ymFromMonIdx(monIdx("2027-01"))).toBe("2027-01");
  });
});

describe("takeHomeForMonth", () => {
  it("uses the month's recorded salary, else the profile salary", () => {
    const S = { ...DEFAULTS, monthlySal: 8000, incomeMonths: { "2026-10": 5000 } };
    expect(takeHomeForMonth(S, "2026-03")).toBe(takeHomeForMonth({ ...S, monthlySal: 5000 }));
    expect(takeHomeForMonth({ ...S, incomeMonths: undefined }, "2026-03")).toBe(
      takeHomeForMonth(S, undefined)
    );
  });
});
