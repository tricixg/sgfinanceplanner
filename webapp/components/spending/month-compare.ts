import type { StackedItem } from "./stacked-series";

export type MonthCompareRow = {
  id: string;
  label: string;
  /** Spend in the chosen month. */
  amount: number;
  /** Spend in the month before. */
  prevAmount: number;
  /** Change vs the month before, as a fraction; null when there was no spend before. */
  change: number | null;
};

export type MonthCompare = {
  rows: MonthCompareRow[];
  /** Largest amount in either month, so bars and markers share one axis. */
  scale: number;
};

/**
 * Pair the chosen month's category totals with the month before. Includes a
 * category spent in only one of the two months (shown at $0 in the other), and
 * sorts by this month's spend, then last month's.
 */
export function buildMonthCompareRows(current: StackedItem[], previous: StackedItem[]): MonthCompare {
  const byId = new Map<string, MonthCompareRow>();
  const row = (item: StackedItem) => {
    let r = byId.get(item.id);
    if (!r) {
      r = { id: item.id, label: item.label, amount: 0, prevAmount: 0, change: null };
      byId.set(item.id, r);
    }
    return r;
  };
  for (const item of current) if (item.amount > 0) row(item).amount += item.amount;
  for (const item of previous) if (item.amount > 0) row(item).prevAmount += item.amount;

  const rows = [...byId.values()]
    .map((r) => ({
      ...r,
      change: r.prevAmount > 0 ? (r.amount - r.prevAmount) / r.prevAmount : null,
    }))
    .sort((a, b) => b.amount - a.amount || b.prevAmount - a.prevAmount || a.label.localeCompare(b.label));

  const scale = rows.reduce((m, r) => Math.max(m, r.amount, r.prevAmount), 0);
  return { rows, scale };
}
