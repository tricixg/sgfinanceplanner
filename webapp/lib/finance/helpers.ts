export const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const fmt2 = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Signed currency for ledgers: +$100.00 / -$94.90 */
export const fmtSigned2 = (n: number) => {
  if (n === 0) return fmt2(0);
  const sign = n > 0 ? "+" : "-";
  return sign + fmt2(Math.abs(n));
};

export const monIdx = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return y * 12 + (m - 1);
};

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** Chart label for portfolio snapshot — date only, no time. */
export function formatSnapshotDate(recordedAt: string): string {
  const iso = recordedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  }
  const dt = new Date(recordedAt);
  if (Number.isNaN(dt.getTime())) return recordedAt.slice(0, 10);
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

export function currentYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function clampDay(year: number, month: number, day: number): number {
  const last = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

export const CHART_FONT = "'SF Mono',ui-monospace,Menlo,monospace";
export const CHART_COLOR = "#7d7560";
