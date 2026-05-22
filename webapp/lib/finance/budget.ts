import type { BudgetItem, DashboardState } from "@/lib/types";
import { stableTakeHome } from "./income";
import { loanLoadForMonth } from "./loanLoad";
import { currentYm } from "./helpers";
import { portfolioValue } from "./wealth";

export const COMPUTED_DEBT_LABEL = "Loans & debt (from Debts & Loans)";

export function defaultBudgetTemplate(): BudgetItem[] {
  return [
    { cat: "Family allowance", amt: 0, type: "fixed" },
    { cat: "Household", amt: 0, type: "fixed" },
    { cat: "Insurance premiums", amt: 0, type: "fixed" },
    { cat: "Living & variable spend", amt: 0, type: "spend" },
    { cat: "Emergency / cash savings", amt: 0, type: "save" },
    { cat: "Investing", amt: 0, type: "invest" },
  ];
}

export function budgetFixedTotal(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "fixed")
    .reduce((s, b) => s + b.amt, 0);
}

export function budgetSpendTotal(S: DashboardState): number {
  return S.budget
    .filter((b) => b.type === "spend")
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
    return saved.budget.map((b) => normalizeBudgetItem(b));
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
      { cat: "Manulife ILP base", amt: saved.manu ?? 0, type: "fixed" },
      { cat: "Variable spending estimate", amt: saved.varSpend ?? 0, type: "spend" }
    );
  }

  if (!items.length) return defaultBudgetTemplate();
  return items;
}

export function budgetVerdict(S: DashboardState, ym?: string) {
  const income = stableTakeHome(S);
  const alloc = S.budget.reduce((s, b) => s + b.amt, 0);
  const debt = computedDebtMonthly(S, ym);
  const left = income - alloc - debt;
  const inv = S.budget
    .filter((b) => b.type === "invest")
    .reduce((s, b) => s + b.amt, 0);
  const sav = S.budget
    .filter((b) => b.type === "save")
    .reduce((s, b) => s + b.amt, 0);
  const invPct = income > 0 ? (inv / income) * 100 : 0;
  const savePct = income > 0 ? (sav / income) * 100 : 0;
  return { income, alloc, debt, left, inv, sav, invPct, savePct };
}

export function budgetProjection(
  S: DashboardState,
  monthlyInv: number,
  monthlySave: number,
  retPct: number,
  yrs: number
) {
  const ret = retPct / 100;
  let invPot = portfolioValue(S.holdings) + S.ilp;
  let cashPot = S.cash;
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
