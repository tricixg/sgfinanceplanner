import { describe, expect, it } from "vitest";
import { filterByOnlineMode, filterPokerSessions } from "@/lib/poker/filter-sessions";
import type { PokerSession } from "@/lib/poker/types";

function session(partial: Partial<PokerSession> & Pick<PokerSession, "id">): PokerSession {
  return {
    userId: "u1",
    sessionType: "cash_game",
    playedAt: "2026-05-01T12:00:00+08:00",
    buyIn: 100,
    cashOut: 150,
    location: "Club",
    isOnline: false,
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

describe("filterByOnlineMode", () => {
  const rows = [
    session({ id: "1", isOnline: true }),
    session({ id: "2", isOnline: false }),
    session({ id: "3", isOnline: true }),
  ];

  it("returns all sessions for mode 'all'", () => {
    expect(filterByOnlineMode(rows, "all")).toHaveLength(3);
  });

  it("returns only online sessions for mode 'online'", () => {
    expect(filterByOnlineMode(rows, "online")).toEqual([rows[0], rows[2]]);
  });

  it("returns only offline sessions for mode 'offline'", () => {
    expect(filterByOnlineMode(rows, "offline")).toEqual([rows[1]]);
  });
});
