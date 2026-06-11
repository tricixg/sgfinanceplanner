import { fmt2 } from "@/lib/finance/helpers";

export function formatPl(value: number): string {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${prefix}${fmt2(Math.abs(value))}`;
}

export function formatPlPlain(value: number): string {
  if (value < 0) return `−${fmt2(Math.abs(value))}`;
  return fmt2(value);
}

export function formatPct(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatHourly(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${formatPl(value)}/h`;
}

export function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return `${formatted}h`;
}

export function plClass(value: number): string {
  if (value > 0) return "pl-pos";
  if (value < 0) return "pl-neg";
  return "";
}

/** Green above 50% session win rate, red below. */
export function wonPctClass(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "";
  if (value > 50) return "pl-pos";
  if (value < 50) return "pl-neg";
  return "";
}

import { formatPokerPlayedAtDisplay, pokerPlayedAtToLedgerIso } from "@/lib/poker/played-at";

export function formatSessionDate(playedAt: string): string {
  return formatPokerPlayedAtDisplay(playedAt);
}

/** Date-only label for charts (no time), SGT calendar date. */
export function formatChartDate(playedAt: string): string {
  const v = playedAt.trim();
  const ymd = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  if (ymd) {
    const [y, m, d] = ymd.split("-").map(Number);
    const month = new Date(y, m - 1, d).toLocaleDateString("en-SG", { month: "short" });
    return `${d} ${month} ${y}`;
  }
  const d = new Date(pokerPlayedAtToLedgerIso(playedAt));
  if (Number.isNaN(d.getTime())) {
    return v.slice(0, 10);
  }
  return d.toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
