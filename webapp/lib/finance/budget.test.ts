import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  budgetFixedTotal,
  COMPUTED_DEBT_LABEL,
  isDebtBudgetCategory,
  monthlyInvestContribution,
  monthlySaveContribution,
} from "./budget";

describe("monthlyInvestContribution", () => {
  it("sums invest-type budget lines", () => {
    expect(monthlyInvestContribution(DEFAULTS)).toBe(1300);
    expect(monthlySaveContribution(DEFAULTS)).toBe(900);
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
