import {
  pokerBuyInSgd,
  pokerCashOutDisplaySgd,
  pokerProfitSgd,
  toSgd,
} from "@/lib/fx/convert";
import type { PokerSession } from "@/lib/poker/types";

export type TournamentStatsSummary = {
  sessions: number;
  placed: number;
  busted: number;
  itmPct: number | null;
  buyIn: number;
  rebuyTotal: number;
  bountyTotal: number;
  amountWonTotal: number;
  returnTotal: number;
  netProfit: number;
  roi: number | null;
  hours: number;
  hourly: number | null;
  avgBuyIn: number | null;
  avgProfit: number | null;
  avgPlace: number | null;
};

export type TournamentBreakdownRow = {
  key: string;
  label: string;
  sessions: number;
  placed: number;
  busted: number;
  buyIn: number;
  netProfit: number;
  itmPct: number | null;
};

export type TournamentStatsBundle = {
  summary: TournamentStatsSummary;
  bySeries: TournamentBreakdownRow[];
};

function tournamentSessions(sessions: PokerSession[]): PokerSession[] {
  return sessions.filter((s) => s.sessionType === "tournament");
}

function aggregateTournamentGroup(group: PokerSession[]): Omit<TournamentBreakdownRow, "key" | "label"> {
  let placed = 0;
  let busted = 0;
  let buyIn = 0;
  let netProfit = 0;

  for (const s of group) {
    if (s.tournamentResult === "placed") placed += 1;
    if (s.tournamentResult === "busted") busted += 1;
    buyIn += pokerBuyInSgd(s);
    netProfit += pokerProfitSgd(s);
  }

  const decided = placed + busted;
  return {
    sessions: group.length,
    placed,
    busted,
    buyIn,
    netProfit,
    itmPct: decided > 0 ? (placed / decided) * 100 : null,
  };
}

function breakdownByField(
  sessions: PokerSession[],
  field: (s: PokerSession) => string
): TournamentBreakdownRow[] {
  const map = new Map<string, PokerSession[]>();
  for (const s of sessions) {
    const label = field(s).trim() || "Unknown";
    const list = map.get(label) ?? [];
    list.push(s);
    map.set(label, list);
  }

  return [...map.entries()]
    .map(([label, group]) => ({
      key: label,
      label,
      ...aggregateTournamentGroup(group),
    }))
    .sort((a, b) => b.sessions - a.sessions || b.netProfit - a.netProfit);
}

export function buildTournamentStats(sessions: PokerSession[]): TournamentStatsBundle {
  const tournaments = tournamentSessions(sessions);

  let placed = 0;
  let busted = 0;
  let buyIn = 0;
  let rebuyTotal = 0;
  let bountyTotal = 0;
  let amountWonTotal = 0;
  let returnTotal = 0;
  let netProfit = 0;
  let hours = 0;
  let placeSum = 0;
  let placeCount = 0;

  for (const s of tournaments) {
    if (s.tournamentResult === "placed") placed += 1;
    if (s.tournamentResult === "busted") busted += 1;
    buyIn += pokerBuyInSgd(s);
    rebuyTotal += toSgd(s.rebuyAmount ?? 0, s.fxRateToSgd);
    bountyTotal += toSgd(s.bountyAmount ?? 0, s.fxRateToSgd);
    amountWonTotal += toSgd(s.amountWon ?? 0, s.fxRateToSgd);
    returnTotal += pokerCashOutDisplaySgd(s);
    netProfit += pokerProfitSgd(s);
    hours += s.hours ?? 0;
    if (s.tournamentResult === "placed" && s.tournamentPlace != null && s.tournamentPlace >= 1) {
      placeSum += s.tournamentPlace;
      placeCount += 1;
    }
  }

  const count = tournaments.length;
  const decided = placed + busted;

  const summary: TournamentStatsSummary = {
    sessions: count,
    placed,
    busted,
    itmPct: decided > 0 ? (placed / decided) * 100 : null,
    buyIn,
    rebuyTotal,
    bountyTotal,
    amountWonTotal,
    returnTotal,
    netProfit,
    roi: buyIn > 0 ? (netProfit / buyIn) * 100 : null,
    hours,
    hourly: hours > 0 ? netProfit / hours : null,
    avgBuyIn: count > 0 ? buyIn / count : null,
    avgProfit: count > 0 ? netProfit / count : null,
    avgPlace: placeCount > 0 ? placeSum / placeCount : null,
  };

  const bySeries = breakdownByField(tournaments, (s) => s.tournamentName ?? "Unknown");

  console.info("[tournament-stats] built", {
    sessions: count,
    placed,
    busted,
    netProfit,
    series: bySeries.length,
  });

  return { summary, bySeries };
}
