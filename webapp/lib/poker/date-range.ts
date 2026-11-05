import { playedAtMs, startOfSgtDayMs, trendRangeStartMs, type TrendRange } from "@/lib/poker/bankroll-trend";
import type { PokerSession } from "@/lib/poker/types";

export type PokerDateRangePreset =
  | "lifetime"
  | "ytd"
  | "past_month"
  | "past_3_months"
  | "past_year"
  | "custom";

export type PokerDateRangeValue = {
  preset: PokerDateRangePreset;
  /** YYYY-MM-DD, used only when preset === "custom". */
  customStart: string;
  customEnd: string;
};

export const DEFAULT_POKER_DATE_RANGE: PokerDateRangeValue = {
  preset: "lifetime",
  customStart: "",
  customEnd: "",
};

export const POKER_DATE_RANGE_PRESETS: { id: PokerDateRangePreset; label: string }[] = [
  { id: "lifetime", label: "Lifetime" },
  { id: "ytd", label: "YTD" },
  { id: "past_month", label: "Past month" },
  { id: "past_3_months", label: "Past 3 months" },
  { id: "past_year", label: "Past year" },
  { id: "custom", label: "Custom…" },
];

const PRESET_TO_TREND_RANGE: Record<"ytd" | "past_month" | "past_3_months" | "past_year", TrendRange> = {
  ytd: "YTD",
  past_month: "1M",
  past_3_months: "3M",
  past_year: "1Y",
};

function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** [startMs, endMs) window for a date-range value; a null bound is open-ended. */
export function pokerDateRangeBoundsMs(
  value: PokerDateRangeValue,
  now: Date = new Date()
): { startMs: number | null; endMs: number | null } {
  if (value.preset === "lifetime") return { startMs: null, endMs: null };

  if (value.preset === "custom") {
    const start = parseYmd(value.customStart);
    const end = parseYmd(value.customEnd);
    if (!start || !end) return { startMs: null, endMs: null };
    const startMs = startOfSgtDayMs(start.y, start.m, start.d);
    const endMs = startOfSgtDayMs(end.y, end.m, end.d) + 24 * 60 * 60 * 1000;
    return { startMs, endMs };
  }

  return { startMs: trendRangeStartMs(PRESET_TO_TREND_RANGE[value.preset], now), endMs: null };
}

export function filterSessionsByDateRange(
  sessions: PokerSession[],
  value: PokerDateRangeValue,
  now: Date = new Date()
): PokerSession[] {
  const { startMs, endMs } = pokerDateRangeBoundsMs(value, now);
  if (startMs == null && endMs == null) return sessions;
  return sessions.filter((s) => {
    const ms = playedAtMs(s.playedAt);
    if (startMs != null && ms < startMs) return false;
    if (endMs != null && ms >= endMs) return false;
    return true;
  });
}
