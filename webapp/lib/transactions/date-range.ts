/** Inclusive calendar-day bounds for transaction history filters (YYYY-MM-DD). */
export type DateRangeFilter = {
  dateFrom?: string;
  dateTo?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

export function parseDateRangeFilter(
  dateFromRaw?: string | null,
  dateToRaw?: string | null
): DateRangeFilter | { error: string } {
  const dateFrom = dateFromRaw?.trim() ?? "";
  const dateTo = dateToRaw?.trim() ?? "";

  if (!dateFrom && !dateTo) return {};

  if (dateFrom && !isIsoDate(dateFrom)) {
    return { error: "dateFrom must be YYYY-MM-DD" };
  }
  if (dateTo && !isIsoDate(dateTo)) {
    return { error: "dateTo must be YYYY-MM-DD" };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { error: "dateFrom must be on or before dateTo" };
  }

  const range: DateRangeFilter = {};
  if (dateFrom) range.dateFrom = dateFrom;
  if (dateTo) range.dateTo = dateTo;
  return range;
}

/** Lower bound for savings `occurred_at` (timestamptz), inclusive. */
export function savingsOccurredAtLowerBound(dateFrom: string): string {
  return `${dateFrom}T00:00:00.000Z`;
}

/** Upper bound for savings `occurred_at` (exclusive next-day midnight UTC). */
export function savingsOccurredAtUpperBoundExclusive(dateTo: string): string {
  const [y, m, d] = dateTo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString();
}
