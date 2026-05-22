import type { DashboardState } from "@/lib/types";
import { cpfEmp } from "./cpf";
import { monIdx } from "./helpers";

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
  return S.newSal - cpfEmp(S.newSal) + S.comms;
}

export function build5m(S: DashboardState): MonthRow[] {
  const ins = insMonthly(S);
  const newCash = stableTakeHome(S);
  const months = [
    {
      m: "Jun 26",
      ym: "2026-06",
      income:
        Math.round((S.oldSal * 19) / 30) +
        Math.round(S.newSal * (9 / 30) - cpfEmp(S.newSal * (9 / 30))),
      fatty: 0,
      note: "split — Eye-Share final + 9d TW",
    },
    {
      m: "Jul 26",
      ym: "2026-07",
      income:
        Math.round(S.newSal * (9 / 30) - cpfEmp(S.newSal * (9 / 30))) +
        S.setup +
        S.comms,
      fatty: S.fatty,
      note: "TW 1st pay: 9d + setup",
    },
    {
      m: "Aug 26",
      ym: "2026-08",
      income: newCash,
      fatty: S.fatty,
      note: "first full TW month",
    },
    {
      m: "Sep 26",
      ym: "2026-09",
      income: newCash,
      fatty: S.fatty,
      note: "stable",
    },
    {
      m: "Oct 26",
      ym: "2026-10",
      income: newCash,
      fatty: S.fatty,
      note: "stable",
    },
  ];

  let running = S.cash;
  return months.map((o) => {
    const fixed = o.fatty + S.house + S.manu;
    const loans = loanLoadForMonth(S.loans, o.ym) + ins;
    const net = o.income - fixed - loans - S.varSpend;
    running += net;
    return { ...o, fixed, loans, net, running };
  });
}

export function currentLoanLoad(S: DashboardState, ym = "2026-06"): number {
  return loanLoadForMonth(S.loans, ym) + insMonthly(S);
}
