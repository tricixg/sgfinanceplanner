import type { BudgetItem, DashboardState } from "@/lib/types";
import type { SavingsGoal, SavingsSnapshot } from "@/lib/savings/types";
import { effectiveMonthlySave } from "./savings-totals";
import { resolveDashboardCash } from "./wealth";
import { isInsuranceBudgetCategory } from "./insurance";
import { isIlpBudgetCategory } from "./ilp";
import { stableTakeHome } from "./income";
import { totalLoanLoadForMonth } from "./loanLoad";
import { budgetYm, currentYm, monIdx } from "./helpers";
import { computedInsuranceMonthly } from "./insurance";
import { computedIlpMonthly, ilpTotalValue } from "./ilp";
import { portfolioInvestmentValue } from "./wealth";

export const COMPUTED_DEBT_LABEL = "Loans & debt (from Debts & Loans)";
export const COMPUTED_SAVINGS_LABEL = "Savings (from Savings & Goals)";
export { COMPUTED_INSURANCE_LABEL, computedInsuranceMonthly } from "./insurance";
export { COMPUTED_ILP_LABEL, computedIlpMonthly } from "./ilp";
export {
  COMPUTED_SUBSCRIPTION_LABEL,
  computedSubscriptionMonthly,
  defaultRecurringSubscription,
  defaultRecurringInvestment,
  recurringFloorsByBudgetLine,
} from "./subscriptions";

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
    { cat: "Investing", amt: 0, type: "invest" },
  ];
}

/** Savings moved to Savings tab — strip legacy save lines from budget. */
export function stripSaveBudgetLines(items: BudgetItem[]): BudgetItem[] {
  return items.filter((b) => b.type !== "save");
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

/** Instalment load from Debts & Loans — not stored in budget. Uses current month unless ym is passed. */
export function computedDebtMonthly(S: DashboardState, ym?: string): number {
  return totalLoanLoadForMonth(S.loans, S.otherLoans ?? [], budgetYm(ym));
}

/** Sum of each active goal's monthlyContribution, as set on the Savings & Goals tab.
 *  Goals with a future startDate are excluded until the saving window opens.
 *  For shared goals, only the current user's split is counted (default 50% if no split set). */
export function computedSavingsMonthly(
  goals: SavingsGoal[],
  myUserId?: string,
  nowYm?: string
): number {
  const now = nowYm ?? currentYm();
  return goals.reduce((sum, g) => {
    if (g.startDate && monIdx(g.startDate.slice(0, 7)) > monIdx(now)) {
      return sum;
    }
    const monthly = g.monthlyContribution > 0 ? g.monthlyContribution : 0;
    if (g.scope === "shared") {
      if (myUserId && g.splits?.[myUserId] != null) {
        return sum + g.splits[myUserId];
      }
      // No split set yet — fall back to 50% of the goal's monthly contribution
      return sum + monthly / 2;
    }
    return sum + monthly;
  }, 0);
}

export function normalizeBudgetItem(b: Partial<BudgetItem>): BudgetItem {
  return {
    id: typeof b.id === "string" ? b.id : undefined,
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
    const migrated = stripSaveBudgetLines(
      saved.budget
        .map((b) => normalizeBudgetItem(b))
        .filter(
          (b) =>
            !isIlpBudgetCategory(b.cat) &&
            !isInsuranceBudgetCategory(b.cat) &&
            !isDebtBudgetCategory(b.cat)
        )
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

export function budgetVerdict(
  S: DashboardState,
  ym?: string,
  savingsMonthly?: number
) {
  const income = stableTakeHome(S);
  const alloc = S.budget.reduce((s, b) => s + b.amt, 0);
  const debt = computedDebtMonthly(S, ym);
  const ilp = computedIlpMonthly(S);
  const insurance = computedInsuranceMonthly(S);
  const savings = savingsMonthly ?? 0;
  const left = income - alloc - debt - ilp - insurance - savings;
  const inv = monthlyInvestContribution(S);
  const sav = monthlySaveContribution(S);
  const invPct = income > 0 ? (inv / income) * 100 : 0;
  const savePct = income > 0 ? (sav / income) * 100 : 0;
  return { income, alloc, debt, ilp, insurance, savings, left, inv, sav, invPct, savePct };
}

export function budgetProjection(
  S: DashboardState,
  monthlyInv: number,
  monthlySave: number,
  retPct: number,
  yrs: number,
  savings?: SavingsSnapshot | null,
  computedSave?: number
) {
  const ret = retPct / 100;
  let invPot = portfolioInvestmentValue(S) + ilpTotalValue(S);
  let cashPot = resolveDashboardCash(S, savings).cash;
  const monthlySaveEff =
    computedSave != null
      ? computedSave
      : savings != null
        ? effectiveMonthlySave(savings, false)
        : monthlySave;
  const labels = ["Now"];
  const invSeries = [invPot];
  const cashSeries = [cashPot];
  const nwSeries = [invPot + cashPot];

  for (let y = 1; y <= yrs; y++) {
    for (let m = 0; m < 12; m++) {
      invPot = invPot * (1 + ret / 12) + monthlyInv;
      cashPot += monthlySaveEff;
    }
    labels.push("Y" + y);
    invSeries.push(invPot);
    cashSeries.push(cashPot);
    nwSeries.push(invPot + cashPot);
  }
  return { labels, invSeries, cashSeries, nwSeries, invPot, cashPot };
}
