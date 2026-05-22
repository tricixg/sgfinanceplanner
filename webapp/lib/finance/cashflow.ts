import type { DashboardState } from "@/lib/types";
import { cpfEmp } from "./cpf";
import { formatMonthLabel, monIdx } from "./helpers";

export type MonthRow = {
  m: string;
  ym: string;
  income: number;
  fatty: number;
  note: string;
  fixed: number;
  loans: number;
  net: number;
  running: number;
};

export function loanLoadForMonth(
  loans: DashboardState["loans"],
  ym: string
): number {
  const idx = monIdx(ym);
  return loans.reduce(
    (s, l) => s + (monIdx(l.end) >= idx ? l.monthly : 0),
    0
  );
}

export function insMonthly(S: DashboardState): number {
  return S.eci + S.tpd + S.acc;
}

export function stableTakeHome(S: DashboardState): number {
  return S.monthlySal - cpfEmp(S.monthlySal) + S.comms;
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
  const ins = insMonthly(S);
  const income = stableTakeHome(S);
  const months = Array.from({ length: count }, (_, i) => {
    const ym = addMonths(startYm, i);
    return {
      m: formatMonthLabel(ym),
      ym,
      income,
      fatty: S.fatty,
      note: "Stable income",
    };
  });

  let running = S.cash;
  return months.map((o) => {
    const fixed = o.fatty + S.house + S.manu;
    const loans = loanLoadForMonth(S.loans, o.ym) + ins;
    const net = o.income - fixed - loans - S.varSpend;
    running += net;
    return { ...o, fixed, loans, net, running };
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
  return loanLoadForMonth(S.loans, ymVal) + insMonthly(S);
}
