import { describe, expect, it } from "vitest";
import { pokerLedgerNote } from "@/lib/poker/ledger-sync";
import { pokerProfit } from "@/lib/poker/types";

describe("pokerLedgerNote", () => {
  it("includes venue when set", () => {
    expect(
      pokerLedgerNote({ venue: "Home NLHE", playedAt: "2026-05-01" })
    ).toBe("Poker: Home NLHE");
  });
});

describe("pokerProfit", () => {
  it("positive when cash-out exceeds buy-in", () => {
    expect(pokerProfit({ buyIn: 100, cashOut: 250 })).toBe(150);
  });

  it("negative on loss", () => {
    expect(pokerProfit({ buyIn: 200, cashOut: 50 })).toBe(-150);
  });
});
