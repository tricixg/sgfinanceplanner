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

export function plClass(value: number): string {
  if (value > 0) return "pl-pos";
  if (value < 0) return "pl-neg";
  return "";
}

import { formatPokerPlayedAtDisplay } from "@/lib/poker/played-at";

export function formatSessionDate(playedAt: string): string {
  return formatPokerPlayedAtDisplay(playedAt);
}
