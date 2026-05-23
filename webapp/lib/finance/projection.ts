import type { DashboardState } from "@/lib/types";
import { ALLOC_MA, ALLOC_OA, ALLOC_SA, cpfEmp, cpfTotal } from "./cpf";
import { stableTakeHome } from "./cashflow";
import { budgetFixedTotal, budgetSpendTotal } from "./budget";
import type { SavingsSnapshot } from "@/lib/savings/types";
import { resolveDashboardCash } from "./wealth";
import { ilpTotalValue } from "./ilp";
import { portfolioInvestmentValue } from "./wealth";
import { monIdx } from "./helpers";

export type ProjectionRow = {
  label: string;
  oa: number;
  sa: number;
  ma: number;
  inv: number;
  cash: number;
  debt: number;
  nw: number;
  sal: number;
};

export type ProjectionParams = {
  growth: number;
  invAdd: number;
  invRet: number;
  useMargin: boolean;
};

export function simulate5y(
  S: DashboardState,
  params: ProjectionParams,
  savings?: SavingsSnapshot | null
): ProjectionRow[] {
  const growth = params.growth / 100;
  const invAdd = params.invAdd;
  const invRet = params.invRet / 100;
  const useMargin = params.useMargin;
  let oa = S.oa;
  let sa = S.sa;
  let ma = S.ma;
  let inv = ilpTotalValue(S) + portfolioInvestmentValue(S);
  let cash = resolveDashboardCash(S, savings).cash;
  let margin = useMargin ? S.margin : 0;
  let sal = S.monthlySal;
  const loanState = S.loans.map((l) => ({ ...l, bal: l.out }));

  const startYM = "2026-08";
  let curIdx = monIdx(startYM);
  const series: ProjectionRow[] = [];

  loanState.forEach((l) => {
    if (monIdx(l.end) < curIdx) l.bal = 0;
  });

  const snapshot = (label: string) => {
    const debt =
      loanState.reduce((s, l) => s + Math.max(0, l.bal), 0) + Math.max(0, margin);
    const cpf = oa + sa + ma;
    const nw = cpf + inv + cash - debt;
    series.push({ label, oa, sa, ma, inv, cash, debt, nw, sal });
  };

  snapshot("Now");

  const endIdx = monIdx("2031-12");
  for (let i = curIdx; i <= endIdx; i++) {
    const tot = cpfTotal(sal);
    oa += tot * ALLOC_OA;
    sa += tot * ALLOC_SA;
    ma += tot * ALLOC_MA;
    oa *= 1 + 0.025 / 12;
    sa *= 1 + 0.04 / 12;
    ma *= 1 + 0.04 / 12;

    let loanPaid = 0;
    loanState.forEach((l) => {
      if (monIdx(l.end) >= i && l.bal > 0) {
        const isFinal = monIdx(l.end) === i;
        const p = isFinal ? l.bal : Math.min(l.monthly || l.bal, l.bal);
        l.bal -= p;
        loanPaid += p;
      }
    });
    inv = inv * (1 + invRet / 12) + invAdd;
    let marginPay = 0;
    if (margin > 0) {
      margin *= 1 + 0.048 / 12;
      marginPay = Math.min(300, margin);
      margin -= marginPay;
    }

    const cashIncome = sal - cpfEmp(sal) + S.comms;
    const fixed = budgetFixedTotal(S);
    const spend = budgetSpendTotal(S);
    const surplus =
      cashIncome - fixed - spend - loanPaid - invAdd - marginPay;
    cash += surplus;

    if (i % 12 === 11) {
      snapshot(String(Math.floor(i / 12)));
      sal = Math.round(sal * (1 + growth));
    }
  }
  return series;
}

export function simulateCPF(
  S: DashboardState,
  growthPct: number
): { label: string; oa: number; sa: number; ma: number }[] {
  const growth = growthPct / 100;
  let oa = S.oa;
  let sa = S.sa;
  let ma = S.ma;
  let sal = S.monthlySal;
  const series = [{ label: "Now", oa, sa, ma }];
  let curIdx = monIdx("2026-08");
  const endIdx = monIdx("2031-12");

  for (let i = curIdx; i <= endIdx; i++) {
    const tot = cpfTotal(sal);
    oa += tot * ALLOC_OA;
    sa += tot * ALLOC_SA;
    ma += tot * ALLOC_MA;
    oa *= 1 + 0.025 / 12;
    sa *= 1 + 0.04 / 12;
    ma *= 1 + 0.04 / 12;
    if (i % 12 === 11) {
      series.push({ label: String(Math.floor(i / 12)), oa, sa, ma });
      sal = Math.round(sal * (1 + growth));
    }
  }
  return series;
}
