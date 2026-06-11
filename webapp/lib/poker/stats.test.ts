import { describe, expect, it } from "vitest";
import { buildPokerStats } from "@/lib/poker/stats";
import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit } from "@/lib/poker/types";

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

describe("buildPokerStats", () => {
  it("aggregates profit by slice", () => {
    const stats = buildPokerStats([
      session({ id: "1", playedAt: "2026-05-01", buyIn: 100, cashOut: 200 }),
      session({
        id: "2",
        playedAt: "2026-05-02",
        sessionType: "tournament",
        buyIn: 50,
        cashOut: 0,
        amountWon: 0,
        tournamentResult: "busted",
      }),
    ]);
    expect(stats.overview.financial.all.netProfit).toBe(50);
    expect(stats.overview.financial.cash_game.netProfit).toBe(100);
    expect(stats.overview.financial.tournament.netProfit).toBe(-50);
  });

  it("converts mixed currencies to SGD for totals", () => {
    const stats = buildPokerStats([
      session({ id: "1", playedAt: "2026-05-01", buyIn: 100, cashOut: 200, currency: "SGD" }),
      session({
        id: "2",
        playedAt: "2026-05-02",
        buyIn: 100,
        cashOut: 200,
        currency: "USD",
        fxRateToSgd: 1.35,
      }),
    ]);
    expect(stats.overview.financial.all.netProfit).toBe(235);
  });

  it("groups locations", () => {
    const stats = buildPokerStats([
      session({ id: "1", playedAt: "2026-05-01", location: "Club" }),
      session({ id: "2", playedAt: "2026-05-02", location: "Club", cashOut: 50 }),
    ]);
    expect(stats.locations).toHaveLength(1);
    expect(stats.locations[0]!.location).toBe("Club");
    expect(stats.locations[0]!.sessions).toBe(2);
  });
});

describe("pokerProfit re-export", () => {
  it("matches session profit", () => {
    expect(
      pokerProfit({ sessionType: "cash_game", buyIn: 100, cashOut: 180, amountWon: null })
    ).toBe(80);
  });
});
