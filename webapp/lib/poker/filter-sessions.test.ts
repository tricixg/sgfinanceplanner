import { describe, expect, it } from "vitest";
import { filterPokerSessions } from "@/lib/poker/filter-sessions";
import type { PokerSession } from "@/lib/poker/types";

function session(partial: Partial<PokerSession> & Pick<PokerSession, "id">): PokerSession {
  return {
    userId: "u1",
    sessionType: "cash_game",
    playedAt: "2026-05-01T12:00:00+08:00",
    buyIn: 100,
    cashOut: 150,
    location: "Club",
    tournamentName: null,
    gameId: "g1",
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

describe("filterPokerSessions", () => {
  const rows = [
    session({ id: "1", sessionType: "cash_game", gameId: "g1", location: "Club" }),
    session({
      id: "2",
      sessionType: "tournament",
      gameId: null,
      location: "Home",
      tournamentName: "APT",
    }),
    session({ id: "3", sessionType: "cash_game", gameId: "g2", location: "Club" }),
  ];

  it("returns all when filters are empty", () => {
    expect(
      filterPokerSessions(rows, { sessionType: "all", gameId: "", location: "" })
    ).toHaveLength(3);
  });

  it("filters by session type", () => {
    expect(
      filterPokerSessions(rows, { sessionType: "cash_game", gameId: "", location: "" })
    ).toHaveLength(2);
    expect(
      filterPokerSessions(rows, { sessionType: "tournament", gameId: "", location: "" })
    ).toHaveLength(1);
  });

  it("filters by location", () => {
    expect(
      filterPokerSessions(rows, { sessionType: "all", gameId: "", location: "Club" })
    ).toHaveLength(2);
  });

  it("filters by stakes game id", () => {
    expect(
      filterPokerSessions(rows, { sessionType: "all", gameId: "g2", location: "" })
    ).toEqual([rows[2]]);
  });
});
