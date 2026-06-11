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
      rebuyAmount: 200,
      bountyAmount: 50,
      tournamentPlace: 8,
      tournamentEntries: 200,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.amountWon).toBe(1200);
      expect(r.data.rebuyAmount).toBe(200);
      expect(r.data.bountyAmount).toBe(50);
      expect(r.data.cashOut).toBe(1250);
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

  it("rejects unsupported currency", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 150,
      gameId: "g-1",
      currency: "XYZ",
    });
    expect(r.ok).toBe(false);
  });

  it("parses manual fx rate", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 150,
      gameId: "g-1",
      currency: "USD",
      fxRateManual: true,
      fxRateToSgd: 1.34,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.currency).toBe("USD");
      expect(r.data.fxRateToSgd).toBe(1.34);
      expect(r.data.fxRateManual).toBe(true);
    }
  });

  it("defaults to SGD when currency omitted", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 150,
      gameId: "g-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.currency).toBe("SGD");
      expect(r.data.fxRateToSgd).toBe(1);
      expect(r.data.fxRateManual).toBe(false);
    }
  });

  it("allows missing financial account", () => {
    const r = parsePokerSessionBody({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 150,
      gameId: "g-1",
      playedAt: "2026-05-20T18:00",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.financialAccountId).toBeNull();
      expect(r.data.playedAt).toBe("2026-05-20T18:00:00+08:00");
    }
  });
});
