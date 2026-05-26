import { describe, expect, it } from "vitest";
import { parsePokerSessionBody } from "@/lib/poker/session-input";

describe("parsePokerSessionBody", () => {
  it("parses cash game", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 150,
      financialAccountId: "fa-1",
      gameId: "g-1",
      location: "Home",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.sessionType).toBe("cash_game");
      expect(r.data.cashOut).toBe(150);
      expect(r.data.gameId).toBe("g-1");
    }
  });

  it("parses tournament placed", () => {
    const r = parsePokerSessionBody({
      sessionType: "tournament",
      buyIn: 500,
      financialAccountId: "fa-1",
      tournamentName: "APT",
      eventName: "Main",
      tournamentResult: "placed",
      amountWon: 1200,
      tournamentPlace: 8,
      tournamentEntries: 200,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.amountWon).toBe(1200);
      expect(r.data.cashOut).toBe(1200);
      expect(r.data.tournamentPlace).toBe(8);
    }
  });

  it("requires game for cash", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 0,
      financialAccountId: "fa-1",
    });
    expect(r.ok).toBe(false);
  });
});
