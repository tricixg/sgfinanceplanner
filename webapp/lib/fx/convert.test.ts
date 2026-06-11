import { describe, expect, it } from "vitest";
import { pokerProfitSgd, toSgd } from "./convert";

describe("toSgd", () => {
  it("returns same amount when rate is 1", () => {
    expect(toSgd(100, 1)).toBe(100);
  });

  it("multiplies by fx rate", () => {
    expect(toSgd(100, 1.35)).toBe(135);
  });
});

describe("pokerProfitSgd", () => {
  it("converts cash game profit to SGD", () => {
    const profit = pokerProfitSgd({
      sessionType: "cash_game",
      buyIn: 100,
      cashOut: 250,
      amountWon: null,
      fxRateToSgd: 1.35,
    });
    expect(profit).toBe(202.5);
  });
});
