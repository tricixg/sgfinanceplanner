import type { BudgetItem, DashboardState } from "@/lib/types";
import { cashAccountsTotal } from "./accounts";
import { isInsuranceBudgetCategory } from "./insurance";
import { isIlpBudgetCategory } from "./ilp";
import { stableTakeHome } from "./income";
import { loanLoadForMonth } from "./loanLoad";
import { currentYm } from "./helpers";
import { computedInsuranceMonthly } from "./insurance";
import { computedIlpMonthly, ilpTotalValue } from "./ilp";
import { portfolioInvestmentValue } from "./wealth";

export const COMPUTED_DEBT_LABEL = "Loans & debt (from Debts & Loans)";
export { COMPUTED_INSURANCE_LABEL, computedInsuranceMonthly } from "./insurance";
export { COMPUTED_ILP_LABEL, computedIlpMonthly } from "./ilp";

/** Budget lines that duplicate Debts & Loans instalments — excluded from fixed totals. */
export function isDebtBudgetCategory(cat: string): boolean {
  const c = cat.toLowerCase().trim();
  return (
    cat === COMPUTED_DEBT_LABEL ||
    c.includes("loans & debt") ||
    c.includes("loan instalment") ||
    c.includes("instalment plan") ||
    (c.includes("instalment") && c.includes("loan")) ||
    (c.includes("debt") && c.includes("loan"))
  );
}

export function defaultBudgetTemplate(): BudgetItem[] {
  return [
    { cat: "Family allowance", amt: 0, type: "fixed" },
    { cat: "Household", amt: 0, type: "fixed" },
    { cat: "Living & variable spend", amt: 0, type: "spend" },
    { cat: "Emergency / cash savings", amt: 0, type: "save" },
    { cat: "Investing", amt: 0, type: "invest" },
  ];
}

export function budgetFixedTotal(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "fixed" && !isDebtBudgetCategory(b.cat))
    .reduce((s, b) => s + b.amt, 0);
}

export function budgetSpendTotal(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "spend")
    .reduce((s, b) => s + b.amt, 0);
}

/** Sum of budget lines with type invest — used on Budget & Savings and 5-year projection. */
export function monthlyInvestContribution(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "invest")
    .reduce((s, b) => s + b.amt, 0);
}

export function monthlySaveContribution(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "save")
    .reduce((s, b) => s + b.amt, 0);
}

/** Instalment load from Debts & Loans — not stored in budget. */
export function computedDebtMonthly(S: DashboardState, ym?: string): number {
  return loanLoadForMonth(S.loans, ym ?? S.cashflowStartYm ?? currentYm());
}

export function normalizeBudgetItem(b: Partial<BudgetItem>): BudgetItem {
  return {
    cat:
      typeof b.cat === "string"
        ? b.cat
        : String((b as { category?: string }).category ?? ""),
    amt: typeof b.amt === "number" ? b.amt : 0,
    type:
      b.type === "fixed" ||
      b.type === "spend" ||
      b.type === "save" ||
      b.type === "invest"
        ? b.type
        : "spend",
  };
}

type LegacyBudgetSaved = {
  budget?: Partial<BudgetItem>[];
  monthlyExpenses?: { name: string; amt: number; kind?: string }[];
  fatty?: number;
  house?: number;
  manu?: number;
  varSpend?: number;
};

export function migrateBudget(saved: LegacyBudgetSaved): BudgetItem[] {
  if (saved.budget?.length) {
    const migrated = saved.budget
      .map((b) => normalizeBudgetItem(b))
      .filter(
        (b) =>
          !isIlpBudgetCategory(b.cat) &&
          !isInsuranceBudgetCategory(b.cat) &&
          !isDebtBudgetCategory(b.cat)
      );
    const dropped = saved.budget.length - migrated.length;
    if (dropped > 0) {
      console.log("[budget] migrateBudget dropped duplicate computed lines", dropped);
    }
    return migrated;
  }

  const items: BudgetItem[] = [];

  if (saved.monthlyExpenses?.length) {
    for (const e of saved.monthlyExpenses) {
      items.push({
        cat: e.name,
        amt: e.amt ?? 0,
        type: e.kind === "variable" ? "spend" : "fixed",
      });
    }
  } else if (
    saved.fatty != null ||
    saved.house != null ||
    saved.manu != null ||
    saved.varSpend != null
  ) {
    items.push(
      { cat: "Family allowance", amt: saved.fatty ?? 0, type: "fixed" },
      { cat: "Household", amt: saved.house ?? 0, type: "fixed" },
      { cat: "Variable spending estimate", amt: saved.varSpend ?? 0, type: "spend" }
    );
  }

  if (!items.length) return defaultBudgetTemplate();
  return items;
}

/** Label for take-home minus all allocations (positive = room left, negative = over budget). */
export function budgetBalanceLabel(left: number): string {
  return left < -1 ? "Over-allocated" : "Remaining";
}

export function budgetVerdict(S: DashboardState, ym?: string) {
  const income = stableTakeHome(S);
  const alloc = S.budget.reduce((s, b) => s + b.amt, 0);
  const debt = computedDebtMonthly(S, ym);
  const ilp = computedIlpMonthly(S);
  const insurance = computedInsuranceMonthly(S);
  const left = income - alloc - debt - ilp - insurance;
  const inv = monthlyInvestContribution(S);
  const sav = monthlySaveContribution(S);
  const invPct = income > 0 ? (inv / income) * 100 : 0;
  const savePct = income > 0 ? (sav / income) * 100 : 0;
  return { income, alloc, debt, ilp, insurance, left, inv, sav, invPct, savePct };
}

export function budgetProjection(
  S: DashboardState,
  monthlyInv: number,
  monthlySave: number,
  retPct: number,
  yrs: number
) {
  const ret = retPct / 100;
  let invPot = portfolioInvestmentValue(S) + ilpTotalValue(S);
  let cashPot = cashAccountsTotal(S);
  const labels = ["Now"];
  const invSeries = [invPot];
  const cashSeries = [cashPot];
  const nwSeries = [invPot + cashPot];

  for (let y = 1; y <= yrs; y++) {
    for (let m = 0; m < 12; m++) {
      invPot = invPot * (1 + ret / 12) + monthlyInv;
      cashPot += monthlySave;
    }
    labels.push("Y" + y);
    invSeries.push(invPot);
    cashSeries.push(cashPot);
    nwSeries.push(invPot + cashPot);
  }
  return { labels, invSeries, cashSeries, nwSeries, invPot, cashPot };
}
