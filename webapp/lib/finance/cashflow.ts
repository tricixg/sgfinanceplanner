import type { DashboardState } from "@/lib/types";
import { budgetFixedTotal, budgetSpendTotal } from "./budget";
import { cashAccountsTotal } from "./accounts";
import { computedInsuranceMonthly } from "./insurance";
import { computedIlpMonthly } from "./ilp";
import { formatMonthLabel } from "./helpers";
import { stableTakeHome } from "./income";
import { loanLoadForMonth } from "./loanLoad";

export { stableTakeHome } from "./income";

export type MonthRow = {
  m: string;
  ym: string;
  income: number;
  note: string;
  fixed: number;
  spend: number;
  loans: number;
  ilp: number;
  insurance: number;
  net: number;
  running: number;
};

export { loanLoadForMonth } from "./loanLoad";

export function insMonthly(S: DashboardState): number {
  return computedInsuranceMonthly(S);
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function buildMonths(
  S: DashboardState,
  startYm: string,
  count = 5
): MonthRow[] {
  const income = stableTakeHome(S);
  const fixed = budgetFixedTotal(S);
  const spend = budgetSpendTotal(S);
  const ilpPrem = computedIlpMonthly(S);
  const insurance = computedInsuranceMonthly(S);
  const months = Array.from({ length: count }, (_, i) => {
    const ym = addMonths(startYm, i);
    return {
      m: formatMonthLabel(ym),
      ym,
      income,
      note: "Stable income",
      fixed,
      spend,
    };
  });

  let running = cashAccountsTotal(S);
  return months.map((o) => {
    const loans = loanLoadForMonth(S.loans, o.ym);
    const net = o.income - o.fixed - o.spend - loans - ilpPrem - insurance;
    running += net;
    return { ...o, loans, ilp: ilpPrem, insurance, net, running };
  });
}

/** @deprecated Use buildMonths */
export function build5m(S: DashboardState): MonthRow[] {
  return buildMonths(S, S.cashflowStartYm ?? "2026-06", 5);
}

export function currentLoanLoad(S: DashboardState, ym?: string): number {
  const ymVal =
    ym ??
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  return loanLoadForMonth(S.loans, ymVal);
}
