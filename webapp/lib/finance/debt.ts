import type { DashboardState, Loan } from "@/lib/types";
import { currentYm, monIdx } from "./helpers";

export type EnrichedLoan = Loan & {
  tag: string;
  cls: string;
  endLbl: string;
  isEnded: boolean;
  index: number;
};

export function enrichLoan(l: Loan, nowYm: string, index: number): EnrichedLoan {
  const nowIdx = monIdx(nowYm);
  const ei = monIdx(l.end);
  let tag: string;
  let cls: string;
  if (ei < nowIdx) {
    tag = "ended";
    cls = "t-end";
  } else if (ei <= nowIdx) {
    tag = "ending";
    cls = "t-soon";
  } else if (ei <= nowIdx + 2) {
    tag = "soon";
    cls = "t-soon";
  } else {
    tag = "active";
    cls = "t-live";
  }
  const endLbl = new Date(l.end + "-01").toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
  return { ...l, tag, cls, endLbl, isEnded: ei < nowIdx, index };
}

export function partitionLoans(S: DashboardState, nowYm?: string) {
  const ym = nowYm ?? currentYm();
  const rows = S.loans
    .map((l, i) => enrichLoan(l, ym, i))
    .filter((l) => l.monthly > 0);
  const byEnd = (a: EnrichedLoan, b: EnrichedLoan) => monIdx(a.end) - monIdx(b.end);
  return {
    active: rows.filter((l) => !l.isEnded).sort(byEnd),
    archived: rows.filter((l) => l.isEnded).sort(byEnd),
  };
}

/** Outstanding balance on loans still active (end month not yet passed). */
export function activeLoanOutstanding(S: DashboardState, nowYm?: string): number {
  const ym = nowYm ?? currentYm();
  const nowIdx = monIdx(ym);
  return S.loans
    .filter((l) => l.monthly > 0 && monIdx(l.end) >= nowIdx)
    .reduce((s, l) => s + l.out, 0);
}

/** Outstanding on other loans (personal, balance transfer) not yet marked paid. */
export function activeOtherLoansOutstanding(S: DashboardState): number {
  return (S.otherLoans ?? [])
    .filter((l) => !l.paidAt && l.outstanding > 0)
    .filter((l) => !(l.loanType === "personal" && l.excludeFromNetWorth))
    .reduce((s, l) => s + l.outstanding, 0);
}

export function debtBurnDown(S: DashboardState) {
  const labels: string[] = [];
  const data: number[] = [];
  const loanState = S.loans.map((l) => ({ ...l, bal: l.out }));

  for (let i = monIdx("2026-06"); i <= monIdx("2027-12"); i++) {
    labels.push(
      new Date(Math.floor(i / 12), i % 12, 1).toLocaleDateString("en-GB", {
        month: "short",
        year: "2-digit",
      })
    );
    const tot = loanState.reduce((s, l) => s + Math.max(0, l.bal), 0);
    data.push(tot);
    loanState.forEach((l) => {
      if (monIdx(l.end) >= i && l.bal > 0) {
        const isFinal = monIdx(l.end) === i;
        l.bal -= isFinal ? l.bal : Math.min(l.monthly || l.bal, l.bal);
      }
    });
  }
  return {
    labels,
    data,
    totalOut: activeLoanOutstanding(S),
  };
}

export function sortedLoans(S: DashboardState, nowYm?: string) {
  const ym = nowYm ?? currentYm();
  return [...S.loans]
    .map((l, i) => enrichLoan(l, ym, i))
    .sort((a, b) => monIdx(a.end) - monIdx(b.end));
}
