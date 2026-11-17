import type { DashboardState } from "@/lib/types";
import { computedInsuranceMonthly } from "./insurance";
import { computedIlpMonthly } from "./ilp";
import { totalLoanLoadForMonth } from "./loanLoad";
import { currentYm } from "./helpers";

/**
 * The monthly figures that are derived from settings rather than typed in:
 * insurance premiums, ILP premiums, and the loan load (instalment plans that
 * are still running that month plus unpaid personal loans).
 *
 * Without a snapshot they follow the CURRENT settings for every month, so
 * changing a premium or deleting a loan rewrote past months' budgets and
 * cashflow. A snapshot freezes a finished month (taken by the month-end job,
 * like salary in budget_months). Current and future months always use live
 * settings: they are not finished yet.
 */
export type ComputedMonthLines = { insurance: number; ilp: number; debt: number };
export type ComputedMonthMap = Record<string, ComputedMonthLines>;

type ComputedSource = Pick<DashboardState, "insurancePolicies" | "ilpPolicies" | "loans" | "otherLoans">;

/** What settings produce for `ym` right now. */
export function liveComputedLines(S: ComputedSource, ym: string): ComputedMonthLines {
  return {
    insurance: computedInsuranceMonthly(S as DashboardState),
    ilp: computedIlpMonthly(S as DashboardState),
    debt: totalLoanLoadForMonth(S.loans, S.otherLoans ?? [], ym),
  };
}

/** Frozen values for a finished month if we have them, else the live ones. */
export function pickComputedLines(
  snapshots: ComputedMonthMap | undefined | null,
  live: ComputedMonthLines,
  ym: string,
  nowYm: string = currentYm()
): ComputedMonthLines {
  if (ym >= nowYm) return live;
  return snapshots?.[ym] ?? live;
}

export function computedLinesForMonth(
  S: ComputedSource & { computedMonths?: ComputedMonthMap },
  ym: string,
  nowYm: string = currentYm()
): ComputedMonthLines {
  return pickComputedLines(S.computedMonths, liveComputedLines(S, ym), ym, nowYm);
}
