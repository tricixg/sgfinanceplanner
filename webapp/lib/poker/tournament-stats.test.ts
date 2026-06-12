import { describe, expect, it } from "vitest";
import { buildTournamentStats } from "@/lib/poker/tournament-stats";
import type { PokerSession } from "@/lib/poker/types";

function tournament(
  partial: Partial<PokerSession> & Pick<PokerSession, "id" | "playedAt">
): PokerSession {
  return {
    userId: "u1",
    sessionType: "tournament",
    buyIn: 500,
    cashOut: 0,
    location: "RWS",
    tournamentName: "APT",
    gameId: null,
    game: null,
    eventName: "Main Event",
    tournamentResult: "busted",
    tournamentPlace: null,
    tournamentEntries: 200,
    amountWon: 0,
    rebuyAmount: 0,
    bountyAmount: 0,
    hours: 8,
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

describe("buildTournamentStats", () => {
  it("aggregates placed and busted counts with ITM rate", () => {
    const stats = buildTournamentStats([
      tournament({ id: "1", playedAt: "2026-01-01", tournamentResult: "busted" }),
      tournament({
        id: "2",
        playedAt: "2026-01-02",
        tournamentResult: "placed",
        amountWon: 1200,
        cashOut: 1200,
        tournamentPlace: 12,
      }),
      tournament({
        id: "3",
        playedAt: "2026-01-03",
        sessionType: "cash_game",
        buyIn: 100,
        cashOut: 200,
        tournamentName: null,
        eventName: null,
        tournamentResult: null,
      }),
    ]);

    expect(stats.summary.sessions).toBe(2);
    expect(stats.summary.placed).toBe(1);
    expect(stats.summary.busted).toBe(1);
    expect(stats.summary.itmPct).toBe(50);
    expect(stats.summary.netProfit).toBe(200);
    expect(stats.summary.buyIn).toBe(1000);
    expect(stats.summary.amountWonTotal).toBe(1200);
    expect(stats.summary.avgPlace).toBe(12);
  });

  it("includes rebuys and bounties in totals", () => {
    const stats = buildTournamentStats([
      tournament({
        id: "1",
        playedAt: "2026-01-01",
        buyIn: 500,
        rebuyAmount: 200,
        tournamentResult: "placed",
        amountWon: 800,
        bountyAmount: 150,
        cashOut: 950,
        tournamentPlace: 5,
      }),
    ]);

    expect(stats.summary.buyIn).toBe(700);
    expect(stats.summary.rebuyTotal).toBe(200);
    expect(stats.summary.bountyTotal).toBe(150);
    expect(stats.summary.returnTotal).toBe(950);
    expect(stats.summary.netProfit).toBe(250);
  });

  it("groups by tournament series name", () => {
    const stats = buildTournamentStats([
      tournament({ id: "1", playedAt: "2026-01-01", tournamentName: "APT" }),
      tournament({ id: "2", playedAt: "2026-02-01", tournamentName: "APT", buyIn: 300 }),
      tournament({ id: "3", playedAt: "2026-03-01", tournamentName: "WSOP" }),
    ]);

    expect(stats.bySeries).toHaveLength(2);
    expect(stats.bySeries[0]?.label).toBe("APT");
    expect(stats.bySeries[0]?.sessions).toBe(2);
  });
});
