import type { DashboardState, Loan } from "@/lib/types";
import { currentYm, formatMonthLabel, monIdx, ymFromMonIdx } from "./helpers";

export type EnrichedLoan = Loan & {
  tag: string;
  cls: string;
  endLbl: string;
  isEnded: boolean;
  index: number;
  /** Whole months until the end month (0 = final month). */
  monthsLeft: number;
  /** Elapsed share of the plan (0–100); null when no valid start month is set. */
  progressPct: number | null;
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
  const monthsLeft = Math.max(0, ei - nowIdx);
  let progressPct: number | null = null;
  if (l.start && /^\d{4}-\d{2}$/.test(l.start)) {
    const total = l.tenureMonths && l.tenureMonths > 0 ? l.tenureMonths : ei - monIdx(l.start);
    if (total > 0) {
      progressPct = Math.min(100, Math.max(0, ((nowIdx - monIdx(l.start)) / total) * 100));
    }
  }
  return { ...l, tag, cls, endLbl, isEnded: ei < nowIdx, index, monthsLeft, progressPct };
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

/** Outstanding on personal loans not yet marked paid, respecting excludeFromNetWorth. */
export function activePersonalLoansOutstanding(S: DashboardState): number {
  return (S.otherLoans ?? [])
    .filter((l) => l.loanType === "personal" && !l.paidAt && l.outstanding > 0)
    .filter((l) => !l.excludeFromNetWorth)
    .reduce((s, l) => s + l.outstanding, 0);
}

/** Outstanding on balance-transfer loans not yet marked paid (no exclude option). */
export function activeBtLoansOutstanding(S: DashboardState): number {
  return (S.otherLoans ?? [])
    .filter((l) => l.loanType === "balance_transfer" && !l.paidAt && l.outstanding > 0)
    .reduce((s, l) => s + l.outstanding, 0);
}

/**
 * Balance-transfer outstanding grouped by linked card, for netting against
 * that card's statement balance. Keyed by `sourceCreditCardId`, which despite
 * its name holds the card's `card_key` (not `credit_cards.id`) — match this
 * map against `OpenCycleEstimate.creditCardKey`, never `.creditCardId`.
 */
export function btOutstandingByCard(S: DashboardState): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of S.otherLoans ?? []) {
    if (l.loanType !== "balance_transfer" || l.paidAt || l.outstanding <= 0) continue;
    if (!l.sourceCreditCardId) continue;
    map.set(l.sourceCreditCardId, (map.get(l.sourceCreditCardId) ?? 0) + l.outstanding);
  }
  return map;
}

/** Outstanding on other loans (personal, balance transfer) not yet marked paid. */
export function activeOtherLoansOutstanding(S: DashboardState): number {
  return activePersonalLoansOutstanding(S) + activeBtLoansOutstanding(S);
}

/** Longest burn-down shown: a loan with an end date far in the future must not
 *  produce an unbounded chart. */
export const DEBT_BURN_DOWN_MAX_MONTHS = 120;

/**
 * Outstanding instalment-loan balance at the start of each month, from the
 * current SGT month (`nowYm`) to the latest end month of any active loan.
 *
 * Meant to show: how today's balance (the same loans and total as
 * `activeLoanOutstanding`) runs down, assuming each loan is paid by its
 * monthly amount and its final month clears whatever remains. Only active
 * loans (monthly > 0 and end month not yet passed) are included, so the first
 * point equals `totalOut`. A trailing month at $0 is added so the chart shows
 * the payoff; with no active loans it is a single $0 point. Capped at
 * DEBT_BURN_DOWN_MAX_MONTHS months.
 */
export function debtBurnDown(S: DashboardState, nowYm?: string) {
  const ym = nowYm ?? currentYm();
  const nowIdx = monIdx(ym);
  const loanState = S.loans
    .filter((l) => l.monthly > 0 && monIdx(l.end) >= nowIdx)
    .map((l) => ({ ...l, bal: l.out }));

  const lastEndIdx = loanState.reduce((m, l) => Math.max(m, monIdx(l.end)), nowIdx);
  // +1: one extra month so the chart ends on the $0 balance after the last payment.
  const endIdx =
    loanState.length === 0
      ? nowIdx
      : Math.min(lastEndIdx + 1, nowIdx + DEBT_BURN_DOWN_MAX_MONTHS - 1);

  const labels: string[] = [];
  const data: number[] = [];
  for (let i = nowIdx; i <= endIdx; i++) {
    labels.push(formatMonthLabel(ymFromMonIdx(i)));
    data.push(loanState.reduce((s, l) => s + Math.max(0, l.bal), 0));
    loanState.forEach((l) => {
      if (monIdx(l.end) >= i && l.bal > 0) {
        const isFinal = monIdx(l.end) === i;
        l.bal -= isFinal ? l.bal : Math.min(l.monthly, l.bal);
      }
    });
  }
  return {
    labels,
    data,
    totalOut: activeLoanOutstanding(S, ym),
  };
}

export function sortedLoans(S: DashboardState, nowYm?: string) {
  const ym = nowYm ?? currentYm();
  return [...S.loans]
    .map((l, i) => enrichLoan(l, ym, i))
    .sort((a, b) => monIdx(a.end) - monIdx(b.end));
}
