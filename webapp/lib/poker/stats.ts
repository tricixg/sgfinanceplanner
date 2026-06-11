import {
  pokerBuyInSgd,
  pokerCashOutDisplaySgd,
  pokerProfitSgd,
} from "@/lib/fx/convert";
import { ymFromPokerPlayedAt } from "@/lib/poker/played-at";
import type { PokerSession, PokerSessionType } from "@/lib/poker/types";
import { formatGameStakes, sessionGameLabel } from "@/lib/poker/types";

export type StatsSlice = PokerSessionType | "all";

export type FinancialTotals = {
  buyIn: number;
  cashOut: number;
  netProfit: number;
};

export type SessionMetrics = {
  sessions: number;
  hours: number;
  netProfit: number;
  hourly: number | null;
  roi: number | null;
  wonPct: number | null;
  avgBuyIn: number | null;
  avgProfit: number | null;
};

export type GameBreakdownRow = {
  key: string;
  label: string;
  hours: number;
  hourly: number | null;
  netProfit: number;
  sessions: number;
};

export type LocationBreakdownRow = {
  location: string;
  sessions: number;
  hours: number;
  hourly: number | null;
  netProfit: number;
  wonPct: number | null;
  cashSessions: number;
  tournamentSessions: number;
};

export type PeriodComparison = {
  sessions: number;
  hours: number;
  netProfit: number;
  hourly: number | null;
  roi: number | null;
};

export type ChartBucket = {
  label: string;
  netProfit: number;
  hours: number;
  hourly: number | null;
  sessions: number;
};

export type LocationDetailStats = {
  location: string;
  totals: FinancialTotals;
  cash: SessionMetrics;
  tournament: SessionMetrics;
  cumulativeProfit: { date: string; profit: number }[];
  byGame: GameBreakdownRow[];
  sessions: PokerSession[];
};

export type PokerStatsBundle = {
  sessions: PokerSession[];
  overview: {
    totalNetProfit: number;
    financial: Record<StatsSlice, FinancialTotals>;
    metrics: Record<StatsSlice, SessionMetrics>;
    games: GameBreakdownRow[];
    monthCompare: {
      current: PeriodComparison;
      previous: PeriodComparison;
    };
  };
  locations: LocationBreakdownRow[];
  charts: {
    weekday: ChartBucket[];
    month: ChartBucket[];
    year: ChartBucket[];
  };
};

function sliceSessions(sessions: PokerSession[], slice: StatsSlice): PokerSession[] {
  if (slice === "all") return sessions;
  return sessions.filter((s) => s.sessionType === slice);
}

function sumBuyIn(sessions: PokerSession[]): number {
  return sessions.reduce((s, x) => s + pokerBuyInSgd(x), 0);
}

function sumCashOutDisplay(sessions: PokerSession[]): number {
  return sessions.reduce((s, x) => s + pokerCashOutDisplaySgd(x), 0);
}

export function financialTotals(sessions: PokerSession[]): FinancialTotals {
  const buyIn = sumBuyIn(sessions);
  const netProfit = sessions.reduce((s, x) => s + pokerProfitSgd(x), 0);
  return {
    buyIn,
    cashOut: sumCashOutDisplay(sessions),
    netProfit,
  };
}

export function sessionMetrics(sessions: PokerSession[]): SessionMetrics {
  const count = sessions.length;
  const hours = sessions.reduce((s, x) => s + (x.hours ?? 0), 0);
  const netProfit = sessions.reduce((s, x) => s + pokerProfitSgd(x), 0);
  const buyIn = sumBuyIn(sessions);
  const wins = sessions.filter((x) => pokerProfitSgd(x) > 0).length;

  return {
    sessions: count,
    hours,
    netProfit,
    hourly: hours > 0 ? netProfit / hours : null,
    roi: buyIn > 0 ? (netProfit / buyIn) * 100 : null,
    wonPct: count > 0 ? (wins / count) * 100 : null,
    avgBuyIn: count > 0 ? buyIn / count : null,
    avgProfit: count > 0 ? netProfit / count : null,
  };
}

function gameKey(session: PokerSession): string {
  if (session.sessionType === "tournament") {
    return `tournament:${session.tournamentName ?? "unknown"}`;
  }
  return session.gameId ? `game:${session.gameId}` : "game:unknown";
}

export function gameBreakdown(sessions: PokerSession[]): GameBreakdownRow[] {
  const cash = sessions.filter((s) => s.sessionType === "cash_game");
  const map = new Map<string, GameBreakdownRow>();

  for (const s of cash) {
    const key = gameKey(s);
    const label = sessionGameLabel(s);
    const row = map.get(key) ?? {
      key,
      label,
      hours: 0,
      hourly: null,
      netProfit: 0,
      sessions: 0,
    };
    row.hours += s.hours ?? 0;
    row.netProfit += pokerProfitSgd(s);
    row.sessions += 1;
    map.set(key, row);
  }

  return [...map.values()]
    .map((r) => ({
      ...r,
      hourly: r.hours > 0 ? r.netProfit / r.hours : null,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

export function locationBreakdown(sessions: PokerSession[]): LocationBreakdownRow[] {
  const map = new Map<string, LocationBreakdownRow>();

  for (const s of sessions) {
    const loc = s.location.trim() || "Unknown";
    const row = map.get(loc) ?? {
      location: loc,
      sessions: 0,
      hours: 0,
      hourly: null,
      netProfit: 0,
      wonPct: null,
      cashSessions: 0,
      tournamentSessions: 0,
    };
    row.sessions += 1;
    row.hours += s.hours ?? 0;
    row.netProfit += pokerProfitSgd(s);
    if (s.sessionType === "cash_game") row.cashSessions += 1;
    else row.tournamentSessions += 1;
    map.set(loc, row);
  }

  return [...map.values()]
    .map((r) => {
      const locSessions = sessions.filter(
        (s) => (s.location.trim() || "Unknown") === r.location
      );
      const wins = locSessions.filter((x) => pokerProfitSgd(x) > 0).length;
      return {
        ...r,
        hourly: r.hours > 0 ? r.netProfit / r.hours : null,
        wonPct: r.sessions > 0 ? (wins / r.sessions) * 100 : null,
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

function ymFromDate(playedAt: string): string {
  return ymFromPokerPlayedAt(playedAt);
}

function periodComparison(
  sessions: PokerSession[],
  ym: string
): PeriodComparison {
  const inMonth = sessions.filter((s) => ymFromDate(s.playedAt) === ym);
  const m = sessionMetrics(inMonth);
  return {
    sessions: m.sessions,
    hours: m.hours,
    netProfit: m.netProfit,
    hourly: m.hourly,
    roi: m.roi,
  };
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chartBuckets(
  sessions: PokerSession[],
  bucketFn: (s: PokerSession) => string,
  sortLabels?: (a: string, b: string) => number
): ChartBucket[] {
  const map = new Map<string, ChartBucket>();

  for (const s of sessions) {
    const label = bucketFn(s);
    const row = map.get(label) ?? {
      label,
      netProfit: 0,
      hours: 0,
      hourly: null,
      sessions: 0,
    };
    row.netProfit += pokerProfitSgd(s);
    row.hours += s.hours ?? 0;
    row.sessions += 1;
    map.set(label, row);
  }

  let rows = [...map.values()].map((r) => ({
    ...r,
    hourly: r.hours > 0 ? r.netProfit / r.hours : null,
  }));

  if (sortLabels) {
    rows = rows.sort((a, b) => sortLabels(a.label, b.label));
  }
  return rows;
}

export function buildPokerStats(sessions: PokerSession[]): PokerStatsBundle {
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousYm = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const slices: StatsSlice[] = ["cash_game", "tournament", "all"];
  const financial = {} as Record<StatsSlice, FinancialTotals>;
  const metrics = {} as Record<StatsSlice, SessionMetrics>;

  for (const slice of slices) {
    const subset = sliceSessions(sessions, slice);
    financial[slice] = financialTotals(subset);
    metrics[slice] = sessionMetrics(subset);
  }

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return {
    sessions: [...sessions].sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
    overview: {
      totalNetProfit: financial.all.netProfit,
      financial,
      metrics,
      games: gameBreakdown(sessions),
      monthCompare: {
        current: periodComparison(sessions, currentYm),
        previous: periodComparison(sessions, previousYm),
      },
    },
    locations: locationBreakdown(sessions),
    charts: {
      weekday: chartBuckets(
        sessions,
        (s) => {
          const d = new Date(s.playedAt);
          const day = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Singapore",
            weekday: "short",
          }).format(d);
          return WEEKDAY_LABELS.includes(day) ? day : WEEKDAY_LABELS[d.getUTCDay()];
        },
        (a, b) => WEEKDAY_LABELS.indexOf(a) - WEEKDAY_LABELS.indexOf(b)
      ),
      month: chartBuckets(
        sessions,
        (s) => {
          const ym = ymFromPokerPlayedAt(s.playedAt);
          const m = parseInt(ym.slice(5, 7), 10);
          return monthNames[m - 1] ?? ym.slice(5, 7);
        },
        (a, b) => monthNames.indexOf(a) - monthNames.indexOf(b)
      ),
      year: chartBuckets(
        sessions,
        (s) => ymFromPokerPlayedAt(s.playedAt).slice(0, 4),
        (a, b) => a.localeCompare(b)
      ),
    },
  };
}

export function locationDetailStats(
  sessions: PokerSession[],
  locationName: string
): LocationDetailStats | null {
  const loc = locationName.trim();
  const subset = sessions.filter((s) => (s.location.trim() || "Unknown") === loc);
  if (subset.length === 0) return null;

  const sorted = [...subset].sort((a, b) => a.playedAt.localeCompare(b.playedAt));
  let running = 0;
  const cumulativeProfit = sorted.map((s) => {
    running += pokerProfitSgd(s);
    return { date: s.playedAt, profit: running };
  });

  return {
    location: loc,
    totals: financialTotals(subset),
    cash: sessionMetrics(subset.filter((s) => s.sessionType === "cash_game")),
    tournament: sessionMetrics(subset.filter((s) => s.sessionType === "tournament")),
    cumulativeProfit,
    byGame: gameBreakdown(subset),
    sessions: [...subset].sort((a, b) => b.playedAt.localeCompare(a.playedAt)),
  };
}
