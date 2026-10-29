import type { OncallEntry, OncallPayment, OncallSettings } from "@/lib/oncall/types";

/** Employee / employer CPF % by age band (rates from 1 Jan 2026). */
export const CPF_AGE_BANDS: { id: string; label: string; employee: number; employer: number }[] = [
  { id: "55", label: "55 and below", employee: 20, employer: 17 },
  { id: "60", label: "Above 55 to 60", employee: 18, employer: 16 },
  { id: "65", label: "Above 60 to 65", employee: 12.5, employer: 12.5 },
  { id: "70", label: "Above 65 to 70", employee: 7.5, employer: 9 },
  { id: "99", label: "Above 70", employee: 5, employer: 7.5 },
];

export const DEFAULT_ONCALL_SETTINGS: OncallSettings = {
  dailyRate: 0,
  cpfAgeBand: "55",
  employeeCpfRate: 20,
  employerCpfRate: 17,
  cpfApplies: true,
  defaultAccountId: null,
};

const DAY_MS = 86_400_000;

function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

export function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(ymdToUtc(v));
}

/** Days in a stretch, counting both ends. 0 when the dates are missing or reversed. */
export function daysInclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const a = ymdToUtc(startDate);
  const b = ymdToUtc(endDate);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** Days of a stretch that fall in a calendar year. */
export function daysInYear(entry: Pick<OncallEntry, "startDate" | "endDate">, year: number): number {
  const a = Math.max(ymdToUtc(entry.startDate), Date.UTC(year, 0, 1));
  const b = Math.min(ymdToUtc(entry.endDate), Date.UTC(year, 11, 31));
  return b < a ? 0 : Math.round((b - a) / DAY_MS) + 1;
}

export type OncallAmounts = {
  days: number;
  gross: number;
  employeeCpf: number;
  employerCpf: number;
  takeHome: number;
};

export function zeroAmounts(): OncallAmounts {
  return { days: 0, gross: 0, employeeCpf: 0, employerCpf: 0, takeHome: 0 };
}

/** Pay for `days` at `rate`; take-home is gross minus employee CPF. */
export function computeAmounts(days: number, rate: number, settings: OncallSettings): OncallAmounts {
  const gross = days * rate;
  const employeeCpf = settings.cpfApplies ? (gross * settings.employeeCpfRate) / 100 : 0;
  const employerCpf = settings.cpfApplies ? (gross * settings.employerCpfRate) / 100 : 0;
  return { days, gross, employeeCpf, employerCpf, takeHome: gross - employeeCpf };
}

export function addAmounts(a: OncallAmounts, b: OncallAmounts): OncallAmounts {
  return {
    days: a.days + b.days,
    gross: a.gross + b.gross,
    employeeCpf: a.employeeCpf + b.employeeCpf,
    employerCpf: a.employerCpf + b.employerCpf,
    takeHome: a.takeHome + b.takeHome,
  };
}

/** Paid days per stretch across all payments. */
export function paidDaysByEntry(payments: OncallPayment[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of payments) {
    for (const item of p.items) {
      out.set(item.entryId, (out.get(item.entryId) ?? 0) + item.days);
    }
  }
  return out;
}

/** Salary months (YYYY-MM, ascending) that paid part of a stretch. */
export function salaryMonthsForEntry(payments: OncallPayment[], entryId: string): string[] {
  const months = new Set<string>();
  for (const p of payments) {
    if (p.items.some((i) => i.entryId === entryId)) months.add(p.salaryMonth);
  }
  return [...months].sort();
}

export function owedDays(entry: OncallEntry, paid: Map<string, number>): number {
  return Math.max(0, daysInclusive(entry.startDate, entry.endDate) - (paid.get(entry.id) ?? 0));
}

/** Worked-out pay for a payment's days, at each stretch's own rate. */
export function paymentAmounts(
  payment: Pick<OncallPayment, "items">,
  entries: OncallEntry[],
  settings: OncallSettings
): OncallAmounts {
  const byId = new Map(entries.map((e) => [e.id, e]));
  let total = zeroAmounts();
  for (const item of payment.items) {
    const entry = byId.get(item.entryId);
    if (entry) total = addAmounts(total, computeAmounts(item.days, entry.dailyRate, settings));
  }
  return total;
}

export type OncallScope = "ytd" | "lifetime";

export type OncallSummary = {
  /** Earned by on-call date (YTD: days falling in `year`). */
  earned: OncallAmounts;
  stretches: number;
  /** Payments by salary month (YYYY-MM in `year` for YTD). */
  received: number;
  receivedCount: number;
  /** Part of `received` logged without a deposit. */
  receivedWithoutDeposit: number;
  /** Unpaid days and their worked-out pay, always all-time. */
  owed: OncallAmounts;
  owedStretches: number;
};

export function summarizeOncall(
  entries: OncallEntry[],
  payments: OncallPayment[],
  settings: OncallSettings,
  scope: OncallScope,
  year: number
): OncallSummary {
  let earned = zeroAmounts();
  let stretches = 0;
  for (const e of entries) {
    const d = scope === "ytd" ? daysInYear(e, year) : daysInclusive(e.startDate, e.endDate);
    if (!d) continue;
    stretches++;
    earned = addAmounts(earned, computeAmounts(d, e.dailyRate, settings));
  }

  let received = 0;
  let receivedCount = 0;
  let receivedWithoutDeposit = 0;
  for (const p of payments) {
    if (scope === "ytd" && p.salaryMonth.slice(0, 4) !== String(year)) continue;
    received += p.amount;
    receivedCount++;
    if (!p.deposited) receivedWithoutDeposit += p.amount;
  }

  const paid = paidDaysByEntry(payments);
  let owed = zeroAmounts();
  let owedStretches = 0;
  for (const e of entries) {
    const d = owedDays(e, paid);
    if (!d) continue;
    owedStretches++;
    owed = addAmounts(owed, computeAmounts(d, e.dailyRate, settings));
  }

  return { earned, stretches, received, receivedCount, receivedWithoutDeposit, owed, owedStretches };
}
