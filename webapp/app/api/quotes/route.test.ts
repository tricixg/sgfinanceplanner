import { describe, expect, it } from "vitest";
import { normalizeQuoteSymbols } from "@/app/api/quotes/route";

describe("normalizeQuoteSymbols", () => {
  it("uppercases, dedupes, and filters invalid symbols", () => {
    expect(
      normalizeQuoteSymbols(["aapl", "AAPL", "—", "", "  msft  ", "TOOLONGSYMBOLTOOLONGSYMBOL"])
    ).toEqual(["AAPL", "MSFT"]);
  });

  it("caps at 20 symbols", () => {
    const many = Array.from({ length: 30 }, (_, i) => `S${i}`);
    expect(normalizeQuoteSymbols(many)).toHaveLength(20);
  });

  it("returns empty for non-array input", () => {
    expect(normalizeQuoteSymbols(undefined)).toEqual([]);
  });
});
