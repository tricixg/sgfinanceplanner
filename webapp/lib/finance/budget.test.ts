import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  budgetFixedTotal,
  COMPUTED_DEBT_LABEL,
  computedDebtMonthly,
  isDebtBudgetCategory,
  monthlyInvestContribution,
  monthlySaveContribution,
} from "./budget";
import { loanLoadForMonth } from "./loanLoad";
import { currentYm } from "./helpers";

describe("monthlyInvestContribution", () => {
  it("sums invest-type budget lines", () => {
    expect(monthlyInvestContribution(DEFAULTS)).toBe(1300);
    expect(monthlySaveContribution(DEFAULTS)).toBe(900);
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
