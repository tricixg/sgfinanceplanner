import { describe, expect, it } from "vitest";
import { filterSessionsByDateRange } from "@/lib/poker/date-range";
import type { PokerSession } from "@/lib/poker/types";

const NOW = new Date("2026-11-05T12:00:00+08:00");

function session(partial: Partial<PokerSession> & Pick<PokerSession, "id" | "playedAt">): PokerSession {
  return {
    userId: "u1",
    sessionType: "cash_game",
    buyIn: 100,
    cashOut: 150,
    location: "Home",
    isOnline: false,
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

const rows = [
  session({ id: "old", playedAt: "2024-01-15T12:00:00+08:00" }),
  session({ id: "ytd", playedAt: "2026-02-01T12:00:00+08:00" }),
  session({ id: "recent", playedAt: "2026-11-01T12:00:00+08:00" }),
  session({ id: "today", playedAt: "2026-11-05T09:00:00+08:00" }),
];

describe("filterSessionsByDateRange", () => {
  it("returns all sessions for lifetime", () => {
    expect(
      filterSessionsByDateRange(rows, { preset: "lifetime", customStart: "", customEnd: "" }, NOW)
    ).toHaveLength(4);
  });

  it("filters to the current calendar year for ytd", () => {
    const result = filterSessionsByDateRange(
      rows,
      { preset: "ytd", customStart: "", customEnd: "" },
      NOW
    );
    expect(result.map((s) => s.id)).toEqual(["ytd", "recent", "today"]);
  });

  it("filters to the past month", () => {
    const result = filterSessionsByDateRange(
      rows,
      { preset: "past_month", customStart: "", customEnd: "" },
      NOW
    );
    expect(result.map((s) => s.id)).toEqual(["recent", "today"]);
  });

  it("filters to an inclusive custom range", () => {
    const result = filterSessionsByDateRange(
      rows,
      { preset: "custom", customStart: "2026-11-01", customEnd: "2026-11-05" },
      NOW
    );
    expect(result.map((s) => s.id)).toEqual(["recent", "today"]);
  });

  it("falls back to no filter when custom dates are incomplete", () => {
    const result = filterSessionsByDateRange(
      rows,
      { preset: "custom", customStart: "2026-11-01", customEnd: "" },
      NOW
    );
    expect(result).toHaveLength(4);
  });
});
