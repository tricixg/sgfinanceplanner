import { describe, expect, it } from "vitest";
import {
  buildBankrollTrendSeries,
  filterTrendByRange,
  trendCornerLabels,
  trendRangeStartMs,
} from "@/lib/poker/bankroll-trend";
import type { PokerSession } from "@/lib/poker/types";

function session(partial: Partial<PokerSession> & Pick<PokerSession, "playedAt">): PokerSession {
  return {
    id: "s1",
    userId: "u1",
    sessionType: "cash_game",
    buyIn: 100,
    cashOut: 150,
    location: "Home",
    tournamentName: null,
    gameId: null,
    game: null,
    eventName: null,
    tournamentResult: null,
    tournamentPlace: null,
    tournamentEntries: null,
    amountWon: null,
    rebuyAmount: 0,
    bountyAmount: 0,
    hours: 2,
    note: "",
    currency: "SGD",
    fxRateToSgd: 1,
    fxRateManual: false,
    financialAccountId: null,
    savingsTransactionId: null,
    createdAt: "",
    ...partial,
  };
}

describe("buildBankrollTrendSeries", () => {
  it("accumulates cash and tourney separately", () => {
    const points = buildBankrollTrendSeries([
      session({ id: "1", playedAt: "2026-01-01", buyIn: 100, cashOut: 200 }),
      session({
        id: "2",
        playedAt: "2026-01-02",
        sessionType: "tournament",
        buyIn: 50,
        cashOut: 0,
        amountWon: 0,
        tournamentResult: "busted",
      }),
      session({ id: "3", playedAt: "2026-01-03", buyIn: 80, cashOut: 120 }),
    ]);
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ cash: 100, tourney: 0, total: 100 });
    expect(points[1]).toMatchObject({ cash: 100, tourney: -50, total: 50 });
    expect(points[2]).toMatchObject({ cash: 140, tourney: -50, total: 90 });
  });

  it("converts foreign currency via fxRateToSgd", () => {
    const points = buildBankrollTrendSeries([
      session({
        id: "1",
        playedAt: "2026-05-01",
        buyIn: 100,
        cashOut: 200,
        currency: "USD",
        fxRateToSgd: 1.35,
      }),
    ]);
    expect(points[0]!.total).toBe(135);
  });
});

describe("filterTrendByRange", () => {
  const now = new Date("2026-06-15T12:00:00+08:00");
  const points = buildBankrollTrendSeries([
    session({ id: "1", playedAt: "2026-01-01", buyIn: 100, cashOut: 200 }),
    session({ id: "2", playedAt: "2026-05-01", buyIn: 100, cashOut: 150 }),
    session({ id: "3", playedAt: "2026-06-10", buyIn: 50, cashOut: 100 }),
  ]);

  it("MAX returns all points", () => {
    expect(filterTrendByRange(points, "MAX", now)).toHaveLength(3);
  });

  it("carries cumulative totals into filtered window", () => {
    const start = trendRangeStartMs("1M", now)!;
    const filtered = filterTrendByRange(points, "1M", now);
    expect(filtered.every((p) => p.x >= start)).toBe(true);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.cash).toBe(200);
    expect(filtered[0]!.total).toBe(200);
  });
});

describe("trendCornerLabels", () => {
  it("finds low across visible series and latest date", () => {
    const points = buildBankrollTrendSeries([
      session({ id: "1", playedAt: "2026-01-01", buyIn: 100, cashOut: 50 }),
      session({
        id: "2",
        playedAt: "2026-02-01",
        sessionType: "tournament",
        buyIn: 200,
        cashOut: 0,
        amountWon: 0,
        tournamentResult: "busted",
      }),
    ]);
    const labels = trendCornerLabels(points, { cash: true, tourney: true, total: true });
    expect(labels.lowValue).toBe(-250);
    expect(labels.lowDate).toBe("2026-02-01");
    expect(labels.latestDate).toBe("2026-02-01");
  });
});
