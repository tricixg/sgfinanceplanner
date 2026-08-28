import type { DashboardState } from "@/lib/types";
import type { OtherLoan } from "@/lib/other-loans/types";
import { monIdx } from "./helpers";

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

/** Monthly instalment load from active personal loans (Debts & Loans). */
export function otherLoanMonthlyLoad(otherLoans: OtherLoan[]): number {
  return otherLoans.reduce(
    (s, l) => s + (l.loanType === "personal" && !l.paidAt ? l.monthly : 0),
    0
  );
}

/** Combined monthly loan/debt load: card-linked instalments plus personal loans. */
export function totalLoanLoadForMonth(
  loans: DashboardState["loans"],
  otherLoans: OtherLoan[],
  ym: string
): number {
  return loanLoadForMonth(loans, ym) + otherLoanMonthlyLoad(otherLoans ?? []);
}
