import type { DashboardState } from "@/lib/types";
import { cpfAgeForMonth, cpfAllocate, cpfEmp } from "./cpf";
import {
  ZERO_BALANCES,
  addBalances,
  isInterestCreditMonth,
  monthlyCpfInterest,
  type CpfBalances,
} from "./cpf-interest";
import { budgetFixedTotal, budgetSpendTotal } from "./budget";
import type { SavingsSnapshot } from "@/lib/savings/types";
import type { OpenCycleEstimate } from "@/lib/cards/types";
import { wealthSummary } from "./wealth";
import { computedInsuranceMonthly } from "./insurance";
import { monIdx, ymFromMonIdx } from "./helpers";
import { sgtTodayYmd } from "@/lib/time/sgt";

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

/**
 * Year-by-year net worth projection.
 *
 * Meant to calculate: CPF + investments + cash − debt at each year end, where
 * "Now" is the SAME figure the Cash Accounts / Financial Health pages show
 * (`netWorthTotal(S, true, savings, openCycles)`). The starting position is
 * therefore seeded from `wealthSummary()` rather than re-derived here.
 *
 * Assumptions (also shown on the Year page):
 *  - Instalment loans and personal loans are paid down 1:1 by their monthly
 *    payment (a personal loan stops costing cash once its balance is 0).
 *  - Balance-transfer loans and credit-card balances are held flat: card spend
 *    is already inside the budget, and BTs have no repayment schedule.
 *  - Insurance premiums are a flat monthly cash outflow.
 *  - Funds are treated as investments (same return as the rest of the pot).
 */
export function simulate5y(
  S: DashboardState,
  params: ProjectionParams,
  todayYmd: string,
  savings?: SavingsSnapshot | null,
  openCycles?: OpenCycleEstimate[]
): ProjectionRow[] {
  const growth = params.growth / 100;
  const invAdd = params.invAdd;
  const invRet = params.invRet / 100;
  const useMargin = params.useMargin;
  const start = wealthSummary(S, savings, openCycles);
  let oa = S.oa;
  let sa = S.sa;
  let ma = S.ma;
  let inv = start.invTotal;
  let cash = start.cash;
  let margin = useMargin ? S.margin : 0;
  let sal = S.monthlySal;
  let cpfPending: CpfBalances = ZERO_BALANCES;
  const insuranceMonthly = computedInsuranceMonthly(S);
  // Liabilities that stay constant over the projection (see assumptions).
  const heldLiab = start.liabLines
    .filter((l) => l.key === "btLoans" || l.key === "cardBalances")
    .reduce((s, l) => s + l.amount, 0);

  const startYM = todayYmd.slice(0, 7);
  const curIdx = monIdx(startYM);
  const series: ProjectionRow[] = [];

  // Same inclusion rule as activeLoanOutstanding(): monthly > 0 and not yet ended.
  const loanState = S.loans.map((l) => ({
    ...l,
    bal: l.monthly > 0 && monIdx(l.end) >= curIdx ? l.out : 0,
  }));
  // Same inclusion rule as activePersonalLoansOutstanding(), except that
  // excludeFromNetWorth loans still cost cash (they are in the budget's debt
  // load) while staying out of the net-worth debt figure.
  const personalState = (S.otherLoans ?? [])
    .filter((l) => l.loanType === "personal" && !l.paidAt && l.outstanding > 0)
    .map((l) => ({
      bal: l.outstanding,
      monthly: l.monthly,
      counted: !l.excludeFromNetWorth,
    }));

  const snapshot = (label: string) => {
    const debt =
      loanState.reduce((s, l) => s + Math.max(0, l.bal), 0) +
      personalState.reduce((s, l) => s + (l.counted ? Math.max(0, l.bal) : 0), 0) +
      heldLiab +
      Math.max(0, margin);
    const cpf = oa + sa + ma;
    const nw = cpf + inv + cash - debt;
    series.push({ label, oa, sa, ma, inv, cash, debt, nw, sal });
  };

  snapshot("Now");

  // Project through December of the 5th calendar year after today, so the
  // yearly snapshots below (`i % 12 === 11`) land on year boundaries instead
  // of a rolling 60-month window.
  const startYear = Number(startYM.slice(0, 4));
  const endIdx = monIdx(`${startYear + 5}-12`);
  for (let i = curIdx; i <= endIdx; i++) {
    const ym = ymFromMonIdx(i);
    const age = cpfAgeForMonth(S.dateOfBirth, ym);
    // CPF interest: this month's interest on the balance held at its start
    // (the month's contribution arrives later, so it earns from next month),
    // paid out once a year in December — see cpf-interest.ts.
    cpfPending = addBalances(cpfPending, monthlyCpfInterest({ oa, sa, ma }, age));
    const credit = cpfAllocate(sal, age);
    oa += credit.oa;
    sa += credit.sa;
    ma += credit.ma;
    if (isInterestCreditMonth(ym)) {
      oa += cpfPending.oa;
      sa += cpfPending.sa;
      ma += cpfPending.ma;
      cpfPending = ZERO_BALANCES;
    }

    let loanPaid = 0;
    loanState.forEach((l) => {
      if (monIdx(l.end) >= i && l.bal > 0) {
        const isFinal = monIdx(l.end) === i;
        const p = isFinal ? l.bal : Math.min(l.monthly, l.bal);
        l.bal -= p;
        loanPaid += p;
      }
    });
    let personalPaid = 0;
    personalState.forEach((l) => {
      if (l.bal > 0 && l.monthly > 0) {
        const p = Math.min(l.monthly, l.bal);
        l.bal -= p;
        personalPaid += p;
      }
    });
    inv = inv * (1 + invRet / 12) + invAdd;
    let marginPay = 0;
    if (margin > 0) {
      margin *= 1 + 0.048 / 12;
      marginPay = Math.min(300, margin);
      margin -= marginPay;
    }

    const cashIncome = sal - cpfEmp(sal, age);
    const fixed = budgetFixedTotal(S, ymFromMonIdx(i));
    const spend = budgetSpendTotal(S, ymFromMonIdx(i));
    const surplus =
      cashIncome -
      fixed -
      spend -
      insuranceMonthly -
      loanPaid -
      personalPaid -
      invAdd -
      marginPay;
    cash += surplus;

    if (i % 12 === 11) {
      snapshot(String(Math.floor(i / 12)));
      sal = Math.round(sal * (1 + growth));
    }
  }
  return series;
}

/**
 * 5-year CPF projection driven by a flat monthly contribution (e.g. the last
 * logged actual contribution) rather than a salary-derived formula. Same
 * interest model as simulateCPF (monthly interest on the lowest balance,
 * credited each December — see cpf-interest.ts), but as a rolling window from
 * now instead of calendar year-end snapshots.
 */
export function simulateCPFFromContribution(
  S: DashboardState,
  monthly: { oa: number; sa: number; ma: number },
  years = 5,
  todayYmd: string = sgtTodayYmd()
): { label: string; oa: number; sa: number; ma: number }[] {
  let oa = S.oa;
  let sa = S.sa;
  let ma = S.ma;
  let pending: CpfBalances = ZERO_BALANCES;
  const series = [{ label: "Now", oa, sa, ma }];
  const startIdx = monIdx(todayYmd.slice(0, 7));
  for (let m = 1; m <= years * 12; m++) {
    const ym = ymFromMonIdx(startIdx + m - 1);
    const age = cpfAgeForMonth(S.dateOfBirth, ym);
    // Interest on the balance at the start of the month; contribution earns from next month.
    pending = addBalances(pending, monthlyCpfInterest({ oa, sa, ma }, age));
    oa += monthly.oa;
    sa += monthly.sa;
    ma += monthly.ma;
    if (isInterestCreditMonth(ym)) {
      oa += pending.oa;
      sa += pending.sa;
      ma += pending.ma;
      pending = ZERO_BALANCES;
    }
    if (m % 12 === 0) {
      // Rolling "Year N" points are not December-aligned, so they include
      // interest accrued so far this year but not yet credited.
      series.push({
        label: `Year ${m / 12}`,
        oa: oa + pending.oa,
        sa: sa + pending.sa,
        ma: ma + pending.ma,
      });
    }
  }
  return series;
}

export function simulateCPF(
  S: DashboardState,
  growthPct: number,
  todayYmd: string
): { label: string; oa: number; sa: number; ma: number }[] {
  const growth = growthPct / 100;
  let oa = S.oa;
  let sa = S.sa;
  let ma = S.ma;
  let sal = S.monthlySal;
  let pending: CpfBalances = ZERO_BALANCES;
  const series = [{ label: "Now", oa, sa, ma }];
  // Same "through December of year+5" window as simulate5y — see its comment.
  const startYM = todayYmd.slice(0, 7);
  const curIdx = monIdx(startYM);
  const startYear = Number(startYM.slice(0, 4));
  const endIdx = monIdx(`${startYear + 5}-12`);

  for (let i = curIdx; i <= endIdx; i++) {
    const ym = ymFromMonIdx(i);
    const age = cpfAgeForMonth(S.dateOfBirth, ym);
    pending = addBalances(pending, monthlyCpfInterest({ oa, sa, ma }, age));
    const credit = cpfAllocate(sal, age);
    oa += credit.oa;
    sa += credit.sa;
    ma += credit.ma;
    if (isInterestCreditMonth(ym)) {
      oa += pending.oa;
      sa += pending.sa;
      ma += pending.ma;
      pending = ZERO_BALANCES;
    }
    if (i % 12 === 11) {
      series.push({ label: String(Math.floor(i / 12)), oa, sa, ma });
      sal = Math.round(sal * (1 + growth));
    }
  }
  return series;
}
