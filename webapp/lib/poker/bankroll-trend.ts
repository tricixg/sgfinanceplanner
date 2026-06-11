import { pokerProfitSgd } from "@/lib/fx/convert";
import { pokerPlayedAtToLedgerIso } from "@/lib/poker/played-at";
import type { PokerSession } from "@/lib/poker/types";
import { sgtParts } from "@/lib/time/sgt";

export type TrendRange = "1W" | "1M" | "3M" | "YTD" | "1Y" | "3Y" | "MAX";

export type BankrollTrendPoint = {
  sessionId: string;
  playedAt: string;
  x: number;
  cash: number;
  tourney: number;
  total: number;
};

export type TrendSeriesVisibility = {
  cash: boolean;
  tourney: boolean;
  total: boolean;
};

export type TrendCornerLabels = {
  lowValue: number | null;
  lowDate: string | null;
  latestDate: string | null;
};

function playedAtMs(playedAt: string): number {
  return new Date(pokerPlayedAtToLedgerIso(playedAt)).getTime();
}

/** Build cumulative cash / tourney / total series (one point per session, ascending). */
export function buildBankrollTrendSeries(sessions: PokerSession[]): BankrollTrendPoint[] {
  const sorted = [...sessions].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  let runningCash = 0;
  let runningTourney = 0;

  return sorted.map((s) => {
    const profit = pokerProfitSgd(s);
    if (s.sessionType === "tournament") {
      runningTourney += profit;
    } else {
      runningCash += profit;
    }
    return {
      sessionId: s.id,
      playedAt: s.playedAt,
      x: playedAtMs(s.playedAt),
      cash: runningCash,
      tourney: runningTourney,
      total: runningCash + runningTourney,
    };
  });
}

function startOfSgtDayMs(year: number, month: number, day: number): number {
  return new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+08:00`).getTime();
}

/** Window start timestamp (SGT calendar) for a trend range. */
export function trendRangeStartMs(range: TrendRange, now: Date = new Date()): number | null {
  if (range === "MAX") return null;

  const p = sgtParts(now);
  const y = Number(p.year);
  const m = Number(p.month);
  const d = Number(p.day);

  if (range === "YTD") {
    return startOfSgtDayMs(y, 1, 1);
  }

  const anchor = startOfSgtDayMs(y, m, d);

  if (range === "1W") {
    return anchor - 7 * 24 * 60 * 60 * 1000;
  }
  if (range === "1M") {
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const lastDay = new Date(prevY, prevM, 0).getDate();
    const dayClamped = Math.min(d, lastDay);
    return startOfSgtDayMs(prevY, prevM, dayClamped);
  }
  if (range === "3M") {
    let tm = m - 3;
    let ty = y;
    while (tm <= 0) {
      tm += 12;
      ty -= 1;
    }
    const lastDay = new Date(ty, tm, 0).getDate();
    const dayClamped = Math.min(d, lastDay);
    return startOfSgtDayMs(ty, tm, dayClamped);
  }
  if (range === "1Y") {
    const lastDay = new Date(y - 1, m, 0).getDate();
    const dayClamped = Math.min(d, lastDay);
    return startOfSgtDayMs(y - 1, m, dayClamped);
  }
  if (range === "3Y") {
    return startOfSgtDayMs(y - 3, m, d);
  }

  return null;
}

/** Slice points to the time window without resetting cumulative y values. */
export function filterTrendByRange(
  points: BankrollTrendPoint[],
  range: TrendRange,
  now: Date = new Date()
): BankrollTrendPoint[] {
  const start = trendRangeStartMs(range, now);
  if (start == null) return points;
  return points.filter((p) => p.x >= start);
}

function valueAtPoint(point: BankrollTrendPoint, key: keyof TrendSeriesVisibility): number {
  if (key === "cash") return point.cash;
  if (key === "tourney") return point.tourney;
  return point.total;
}

/** Lowest y across visible series and the date it occurred; latest session date in set. */
export function trendCornerLabels(
  points: BankrollTrendPoint[],
  visibility: TrendSeriesVisibility
): TrendCornerLabels {
  if (points.length === 0) {
    return { lowValue: null, lowDate: null, latestDate: null };
  }

  const keys = (["cash", "tourney", "total"] as const).filter((k) => visibility[k]);
  let lowValue: number | null = null;
  let lowDate: string | null = null;

  if (keys.length > 0) {
    for (const point of points) {
      for (const key of keys) {
        const v = valueAtPoint(point, key);
        if (lowValue == null || v < lowValue) {
          lowValue = v;
          lowDate = point.playedAt;
        }
      }
    }
  }

  const latest = points[points.length - 1]!;
  return {
    lowValue,
    lowDate,
    latestDate: latest.playedAt,
  };
}

export function findNearestPoint(
  points: BankrollTrendPoint[],
  xValue: number
): BankrollTrendPoint | null {
  if (points.length === 0) return null;
  let best = points[0]!;
  let bestDist = Math.abs(best.x - xValue);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const dist = Math.abs(p.x - xValue);
    if (dist < bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}

export const TREND_RANGES: TrendRange[] = ["1W", "1M", "3M", "YTD", "1Y", "3Y", "MAX"];
