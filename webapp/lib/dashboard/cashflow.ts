import { addMonthsYm } from "@/lib/finance/calendar";
import type { IncomeAnalyticsBundle } from "@/lib/income/analytics";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";

/**
 * Dashboard cash-flow maths. Pure functions over the monthly rows already
 * produced by /api/income/analytics and /api/spending/analytics — nothing here
 * invents data; it only slices, sums and compares what those endpoints return.
 */

export type RangeKey = "this-month" | "last-month" | "3m" | "6m" | "ytd" | "12m";

export const RANGE_OPTIONS: {
  key: RangeKey;
  label: string;
  short: string;
  /** Narrow-screen label. */
  compact: string;
}[] = [
  { key: "this-month", label: "This month", short: "This month", compact: "Month" },
  { key: "last-month", label: "Last month", short: "Last month", compact: "Last" },
  { key: "3m", label: "3 months", short: "3M", compact: "3M" },
  { key: "6m", label: "6 months", short: "6M", compact: "6M" },
  { key: "ytd", label: "Year to date", short: "YTD", compact: "YTD" },
  { key: "12m", label: "12 months", short: "12M", compact: "12M" },
];

export type RangeWindow = {
  key: RangeKey;
  /** Months in the selected period, oldest first. */
  months: string[];
  /** Equal-length period immediately before, oldest first. */
  prior: string[];
  /** True when the period includes the current, still-in-progress month. */
  includesCurrentMonth: boolean;
};

function monthsEnding(endYm: string, count: number): string[] {
  const list: string[] = [];
  for (let i = count - 1; i >= 0; i--) list.push(addMonthsYm(endYm, -i));
  return list;
}

export function rangeWindow(key: RangeKey, currentYm: string): RangeWindow {
  let end = currentYm;
  let count = 1;
  switch (key) {
    case "this-month":
      break;
    case "last-month":
      end = addMonthsYm(currentYm, -1);
      break;
    case "3m":
      count = 3;
      break;
    case "6m":
      count = 6;
      break;
    case "12m":
      count = 12;
      break;
    case "ytd":
      count = Number(currentYm.slice(5, 7));
      break;
  }
  const months = monthsEnding(end, count);
  const prior = monthsEnding(addMonthsYm(months[0]!, -1), count);
  return { key, months, prior, includesCurrentMonth: months.includes(currentYm) };
}

/** Months to plot for a range: the period itself, padded to at least six for context. */
export function trendMonths(window: RangeWindow, currentYm: string): string[] {
  const count = Math.max(6, window.months.length);
  return monthsEnding(currentYm, count);
}

/** Size of one analytics request — matches the app's existing ~5-month fetches. */
export const CHUNK_MONTHS = 6;

export type AnalyticsChunk = { throughYm: string; months: number };

/**
 * Fixed 6-month request windows counted back from the current month, enough to
 * cover `earliestYm`. Fixed boundaries let responses be cached and reused when
 * the user switches range.
 */
export function chunksCovering(earliestYm: string, currentYm: string): AnalyticsChunk[] {
  const chunks: AnalyticsChunk[] = [];
  let through = currentYm;
  // 24 months is the most any range needs (12 months plus its comparison period).
  for (let i = 0; i < 4; i++) {
    chunks.push({ throughYm: through, months: CHUNK_MONTHS });
    const start = addMonthsYm(through, -(CHUNK_MONTHS - 1));
    if (start <= earliestYm) break;
    through = addMonthsYm(start, -1);
  }
  return chunks;
}

export type AmountRow = { id: string; label: string; amount: number };

export type MonthFlow = {
  ym: string;
  income: number;
  spending: number;
  incomeBySource: AmountRow[];
  spendingByCategory: AmountRow[];
};

export type MonthFlowMap = Map<string, MonthFlow>;

function emptyMonth(ym: string): MonthFlow {
  return { ym, income: 0, spending: 0, incomeBySource: [], spendingByCategory: [] };
}

/** Merge any number of analytics responses into one month-keyed map. */
export function mergeFlows(
  spending: Pick<SpendingAnalyticsBundle, "monthly">[],
  income: Pick<IncomeAnalyticsBundle, "monthly">[]
): MonthFlowMap {
  const map: MonthFlowMap = new Map();
  const at = (ym: string) => {
    let row = map.get(ym);
    if (!row) {
      row = emptyMonth(ym);
      map.set(ym, row);
    }
    return row;
  };
  for (const bundle of spending) {
    for (const m of bundle.monthly) {
      const row = at(m.ym);
      row.spending = m.total;
      row.spendingByCategory = m.byCategory;
    }
  }
  for (const bundle of income) {
    for (const m of bundle.monthly) {
      const row = at(m.ym);
      row.income = m.total;
      row.incomeBySource = m.byCategory;
    }
  }
  return map;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function sumRows(lists: AmountRow[][]): AmountRow[] {
  const totals = new Map<string, AmountRow>();
  for (const list of lists) {
    for (const r of list) {
      const prev = totals.get(r.id);
      if (prev) prev.amount += r.amount;
      else totals.set(r.id, { ...r });
    }
  }
  return [...totals.values()]
    .map((r) => ({ ...r, amount: round2(r.amount) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export type FlowSummary = {
  income: number;
  spending: number;
  net: number;
  /** Net ÷ income; null when there is no income to divide by. */
  savingsRate: number | null;
  /** Months in the period that have any recorded activity. */
  activeMonths: number;
  spendingByCategory: AmountRow[];
  incomeBySource: AmountRow[];
};

export function summariseFlows(flows: MonthFlowMap, months: string[]): FlowSummary {
  const rows = months.map((ym) => flows.get(ym) ?? emptyMonth(ym));
  const income = round2(rows.reduce((s, r) => s + r.income, 0));
  const spending = round2(rows.reduce((s, r) => s + r.spending, 0));
  const net = round2(income - spending);
  return {
    income,
    spending,
    net,
    savingsRate: income > 0 ? net / income : null,
    activeMonths: rows.filter((r) => r.income > 0 || r.spending > 0).length,
    spendingByCategory: sumRows(rows.map((r) => r.spendingByCategory)),
    incomeBySource: sumRows(rows.map((r) => r.incomeBySource)),
  };
}

/** Percentage change, or null when the earlier figure can't anchor a comparison. */
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

export type RankedShare = AmountRow & { share: number };

/** Top `limit` rows with the remainder rolled into "Other"; shares are of the grand total. */
export function topWithOther(rows: AmountRow[], limit: number): RankedShare[] {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (total <= 0) return [];
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const head = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const out: RankedShare[] = head.map((r) => ({ ...r, share: r.amount / total }));
  if (rest.length > 0) {
    const other = round2(rest.reduce((s, r) => s + r.amount, 0));
    out.push({
      id: "__other__",
      label: rest.length === 1 ? rest[0]!.label : `Other (${rest.length})`,
      amount: other,
      share: other / total,
    });
  }
  return out;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function shortMonth(ym: string): string {
  return MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym;
}

export function monthYear(ym: string): string {
  return `${shortMonth(ym)} ${ym.slice(0, 4)}`;
}

/** Human label for a period, e.g. "1–17 Nov 2026" or "Jun – Nov 2026". */
export function periodLabel(window: RangeWindow, todayYmd: string): string {
  const first = window.months[0]!;
  const last = window.months[window.months.length - 1]!;
  if (window.months.length === 1) {
    if (window.includesCurrentMonth) {
      const day = Number(todayYmd.slice(8, 10));
      return day > 1 ? `1–${day} ${monthYear(last)}` : `1 ${monthYear(last)}`;
    }
    return monthYear(last);
  }
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const from = sameYear ? shortMonth(first) : monthYear(first);
  const suffix = window.includesCurrentMonth ? " to date" : "";
  return `${from} – ${monthYear(last)}${suffix}`;
}

/** Label for the comparison period, e.g. "Oct" or "Mar – May". */
export function priorLabel(window: RangeWindow): string {
  const first = window.prior[0]!;
  const last = window.prior[window.prior.length - 1]!;
  if (window.prior.length === 1) return shortMonth(last);
  return `${shortMonth(first)} – ${shortMonth(last)}`;
}

/** Share of the calendar month that has elapsed (0–1) for a YYYY-MM-DD date. */
export function monthElapsed(todayYmd: string): number {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const days = new Date(y!, m!, 0).getDate();
  return Math.min(1, Math.max(0, d! / days));
}
