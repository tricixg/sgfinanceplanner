import { sgtTodayYmd } from "@/lib/time/sgt";

/**
 * Months as a single integer (year * 12 + month - 1), so "36 months later" is
 * plain addition. Lots are usable up to the last day of their expiry month.
 */
export type MonthIndex = number;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthIndex = (year: number, month: number): MonthIndex => year * 12 + month - 1;
export const yearOf = (m: MonthIndex): number => Math.floor(m / 12);
export const monthOf = (m: MonthIndex): number => (m % 12) + 1;

/** "2026-11-01" (or "2026-11-26", "2026-11") → month index. */
export function monthFromYmd(ymd: string | null | undefined): MonthIndex | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})/.exec(ymd);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return monthIndex(Number(m[1]), month);
}

/** Month index → "2026-11-01" (database date for the first of the month). */
export const monthToYmd = (m: MonthIndex): string =>
  `${yearOf(m)}-${String(monthOf(m)).padStart(2, "0")}-01`;

/** Month index → "2026-11" for <input type="month">. */
export const monthToInput = (m: MonthIndex): string => monthToYmd(m).slice(0, 7);

/** This month in Singapore. */
export const sgtThisMonth = (now?: Date): MonthIndex => monthFromYmd(sgtTodayYmd(now))!;

/** Day of the month today in Singapore. */
export const sgtDayOfMonth = (now?: Date): number => Number(sgtTodayYmd(now).slice(8, 10));

export const lastDayOf = (m: MonthIndex): number => new Date(yearOf(m), monthOf(m), 0).getDate();

/** "Nov 2026" */
export const monthLabel = (m: MonthIndex): string => `${MON[m % 12]} ${yearOf(m)}`;

/** "Nov ’26" */
export const monthShort = (m: MonthIndex): string =>
  `${MON[m % 12]} ’${String(yearOf(m)).slice(2)}`;

/** "30 Nov 2026" — the last day of the month, when a lot expires. */
export const expiryDateLabel = (m: MonthIndex): string => `${lastDayOf(m)} ${monthLabel(m)}`;

/** Last month of the calendar quarter the month is in. */
export const quarterEnd = (m: MonthIndex): MonthIndex => m - ((m % 12) % 3) + 2;

/** First month of the calendar quarter the month is in. */
export const quarterStart = (m: MonthIndex): MonthIndex => m - ((m % 12) % 3);

/** "Oct–Dec 2026" */
export function quarterLabel(m: MonthIndex): string {
  const s = quarterStart(m);
  return `${MON[s % 12]}–${MON[(s + 2) % 12]} ${yearOf(s)}`;
}

/** Whole days from `today` (a Date) until the end of the expiry month, rounded up. */
export function daysUntilEndOf(m: MonthIndex, today: Date): number {
  const end = new Date(yearOf(m), monthOf(m) - 1, lastDayOf(m), 23, 59, 59);
  return Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86_400_000));
}
