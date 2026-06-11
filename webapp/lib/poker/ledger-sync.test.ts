import { describe, expect, it } from "vitest";
import { pokerLedgerNote } from "@/lib/poker/ledger-sync";
import type { PokerSession } from "@/lib/poker/types";
import { pokerProfit } from "@/lib/poker/types";

function sampleSession(overrides: Partial<PokerSession> = {}): PokerSession {
  return {
    id: "s1",
    userId: "u1",
    sessionType: "cash_game",
    playedAt: "2026-05-01",
    buyIn: 100,
    cashOut: 200,
    location: "Home",
    tournamentName: null,
    gameId: "g1",
    game: {
      id: "g1",
      userId: "u1",
      name: "NLHE",
      smallBlind: 1,
      bigBlind: 2,
      ante: null,
      createdAt: "",
    },
    eventName: null,
    tournamentResult: null,
    tournamentPlace: null,
    tournamentEntries: null,
    amountWon: null,
    rebuyAmount: 0,
    bountyAmount: 0,
    hours: null,
    note: "",
    currency: "SGD",
    fxRateToSgd: 1,
    fxRateManual: false,
    financialAccountId: null,
    savingsTransactionId: null,
    createdAt: "",
    ...overrides,
  };
}

describe("pokerLedgerNote", () => {
  it("includes location and game for cash game", () => {
    expect(pokerLedgerNote(sampleSession())).toBe("Poker · NLHE (1/2) · @ Home");
  });

  it("includes tournament name and event", () => {
    expect(
      pokerLedgerNote(
        sampleSession({
          sessionType: "tournament",
          game: null,
          gameId: null,
          tournamentName: "WSOP",
          eventName: "Main Event Day 1",
          location: "Paris",
        })
      )
    ).toBe("Poker · WSOP · Main Event Day 1 · @ Paris");
  });
});

describe("pokerProfit", () => {
  it("positive when cash-out exceeds buy-in", () => {
    expect(
      pokerProfit({ sessionType: "cash_game", buyIn: 100, cashOut: 250, amountWon: null })
    ).toBe(150);
  });

  it("negative on cash game loss", () => {
    expect(
      pokerProfit({ sessionType: "cash_game", buyIn: 200, cashOut: 50, amountWon: null })
    ).toBe(-150);
  });

  it("uses prize minus buy-in for tournaments", () => {
    expect(
      pokerProfit({
        sessionType: "tournament",
        buyIn: 200,
        cashOut: 500,
        amountWon: 500,
      })
    ).toBe(300);
  });

  it("includes rebuys in tournament cost", () => {
    expect(
      pokerProfit({
        sessionType: "tournament",
        buyIn: 500,
        cashOut: 1200,
        amountWon: 1200,
        rebuyAmount: 200,
      })
    ).toBe(500);
  });

  it("includes bounties in tournament return", () => {
    expect(
      pokerProfit({
        sessionType: "tournament",
        buyIn: 500,
        cashOut: 150,
        amountWon: 0,
        bountyAmount: 150,
      })
    ).toBe(-350);
  });
});
