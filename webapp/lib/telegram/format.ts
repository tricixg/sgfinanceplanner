import { fmt2 } from "@/lib/finance/helpers";

export function fmtMoney(n: number): string {
  return fmt2(n);
}

export function parsePositiveAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Hours played — zero allowed; rejects negative or non-numeric. */
export function parseNonNegativeHours(text: string): number | null {
  return parseNonNegativeAmount(text);
}

/** Amounts that may be zero (e.g. blinds). */
export function parseNonNegativeAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Whole number ≥ 1 (e.g. tournament place, field size). */
export function parsePositiveInt(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.round(n);
}

export function truncateLabel(label: string, max = 28): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
