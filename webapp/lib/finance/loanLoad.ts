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
