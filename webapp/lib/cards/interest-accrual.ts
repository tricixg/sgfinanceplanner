import { addDaysYmd, formatYmd } from "./statement-cycle";

export type DailySpendMap = Record<string, number>;

/** Enumerate YYYY-MM-DD from start through end inclusive. */
export function eachDayYmd(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/**
 * Simple daily interest on end-of-day balance (balance includes prior days' interest).
 * `principalAtDue` = unpaid principal at end of payment due date.
 * Interest runs from the day after `interestStartDate` through `throughDate`.
 */
export function accrueDailyInterest(params: {
  aprPercent: number;
  principalAtDue: number;
  dailySpend: DailySpendMap;
  interestStartDate: string;
  throughDate: string;
}): number {
  const { aprPercent, principalAtDue, dailySpend, interestStartDate, throughDate } =
    params;

  if (principalAtDue <= 0 || aprPercent <= 0) return 0;
  if (interestStartDate > throughDate) return 0;

  const dailyRate = aprPercent / 100 / 365;
  let balance = principalAtDue;
  let totalInterest = 0;

  for (const day of eachDayYmd(interestStartDate, throughDate)) {
    balance += dailySpend[day] ?? 0;
    const dayInterest = balance * dailyRate;
    totalInterest += dayInterest;
    balance += dayInterest;
  }

  return roundMoney(totalInterest);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Principal still owed at end of due date (before post-due interest). */
export function principalAtDue(params: {
  carriedForwardIn: number;
  actualAmount: number | null;
  amountPaid: number;
}): number {
  const actual = params.actualAmount ?? 0;
  const raw =
    params.carriedForwardIn + actual - params.amountPaid;
  return Math.max(0, roundMoney(raw));
}

export function outstandingBalance(params: {
  carriedForwardIn: number;
  actualAmount: number | null;
  interestAccrued: number;
  amountPaid: number;
}): number {
  const actual = params.actualAmount ?? 0;
  const raw =
    params.carriedForwardIn +
    actual +
    params.interestAccrued -
    params.amountPaid;
  return Math.max(0, roundMoney(raw));
}

/**
 * Portion of `total` covered by a linked balance-transfer loan (capped at
 * `total`, floored at 0) — same clamp `splitCardPaymentAmount` uses to split
 * a card payment between BT and non-BT, applied here to net BT loans out of
 * a card's outstanding balance so net-worth math never double-counts them.
 */
export function btCoveredAmount(btOutstanding: number, total: number): number {
  return Math.min(Math.max(0, btOutstanding), Math.max(0, total));
}

export function interestStartAfterDue(paymentDueDate: string): string {
  return addDaysYmd(paymentDueDate, 1);
}

export function todayYmd(): string {
  return formatYmd(new Date());
}

export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
