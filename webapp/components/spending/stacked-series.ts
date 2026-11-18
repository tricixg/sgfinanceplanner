/** One labelled amount in a month (a category, card or account). */
export type StackedItem = { id: string; label: string; amount: number };

export const OTHER_SERIES_ID = "__other__";

export type StackedSeries = {
  id: string;
  label: string;
  data: number[];
};

export type StackedSeriesResult = {
  /** Named series (in display order) followed by an optional "Other" series. */
  series: StackedSeries[];
  /** Per month index: the rows folded into "Other", largest first. */
  otherMembers: StackedItem[][];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Choose which ids get their own stacked-bar segment.
 *
 * Takes the union of each month's top `perMonth` ids so a category that is
 * significant in any single month is never hidden in "Other" just because a
 * different month dominated the window total. The union is capped at `cap`
 * (by peak single-month amount), then ordered by window total.
 */
export function pickSeriesIds(
  itemsByMonth: StackedItem[][],
  perMonth: number,
  cap: number,
): string[] {
  const totals = new Map<string, number>();
  const peaks = new Map<string, number>();
  const candidates = new Set<string>();

  for (const monthItems of itemsByMonth) {
    const items = monthItems.filter((r) => r.amount > 0);
    for (const item of items) {
      totals.set(item.id, (totals.get(item.id) ?? 0) + item.amount);
      peaks.set(item.id, Math.max(peaks.get(item.id) ?? 0, item.amount));
    }
    [...items]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, perMonth)
      .forEach((r) => candidates.add(r.id));
  }

  return [...candidates]
    .sort((a, b) => (peaks.get(b) ?? 0) - (peaks.get(a) ?? 0))
    .slice(0, cap)
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
}

export function buildStackedSeries(
  itemsByMonth: StackedItem[][],
  perMonth: number,
  cap: number,
): StackedSeriesResult {
  const ids = pickSeriesIds(itemsByMonth, perMonth, cap);
  const idSet = new Set(ids);

  const labels = new Map<string, string>();
  for (const monthItems of itemsByMonth) {
    for (const item of monthItems) {
      if (!labels.has(item.id)) labels.set(item.id, item.label);
    }
  }

  const series: StackedSeries[] = ids.map((id) => ({
    id,
    label: labels.get(id) ?? id,
    data: itemsByMonth.map((items) => items.find((r) => r.id === id)?.amount ?? 0),
  }));

  const otherMembers = itemsByMonth.map((items) =>
    items
      .filter((r) => !idSet.has(r.id) && r.amount > 0)
      .sort((a, b) => b.amount - a.amount),
  );

  if (otherMembers.some((m) => m.length > 0)) {
    series.push({
      id: OTHER_SERIES_ID,
      label: "Other",
      data: otherMembers.map((m) => round2(m.reduce((s, r) => s + r.amount, 0))),
    });
  }

  return { series, otherMembers };
}
