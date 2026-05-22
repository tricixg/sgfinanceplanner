import type { BudgetItem, DashboardState } from "@/lib/types";
import { portfolioValue } from "./wealth";
import { stableTakeHome } from "./cashflow";

export function defaultBudgetTemplate(): BudgetItem[] {
  return [
    { cat: "Family allowance", amt: 0, type: "fixed" },
    { cat: "Household", amt: 0, type: "fixed" },
    { cat: "Insurance + ILP", amt: 0, type: "fixed" },
    { cat: "Living & variable spend", amt: 0, type: "spend" },
    { cat: "Emergency / cash savings", amt: 0, type: "save" },
    { cat: "Investing", amt: 0, type: "invest" },
  ];
}

export function budgetVerdict(S: DashboardState) {
  const income = stableTakeHome(S);
  const alloc = S.budget.reduce((s, b) => s + b.amt, 0);
  const left = income - alloc;
  const inv = S.budget.filter((b) => b.type === "invest").reduce((s, b) => s + b.amt, 0);
  const sav = S.budget.filter((b) => b.type === "save").reduce((s, b) => s + b.amt, 0);
  const invPct = (inv / income) * 100;
  const savePct = (sav / income) * 100;
  return { income, alloc, left, inv, sav, invPct, savePct };
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
