import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  appendPortfolioSnapshot,
  holdingGain,
  normalizeHolding,
  normalizeTicker,
  portfolioTotals,
  quoteSymbolsFromHoldings,
} from "./holdings";

describe("holdings", () => {
  it("normalizes SGX ticker to .SI", () => {
    expect(normalizeTicker("OU8", "SGX")).toBe("OU8.SI");
    expect(normalizeTicker("OU8.SI", "SGX")).toBe("OU8.SI");
  });

  it("normalizes US ticker without .SI", () => {
    expect(normalizeTicker("AAPL", "US")).toBe("AAPL");
  });

  it("migrates legacy price to avgCost and lastPrice", () => {
    const h = normalizeHolding({
      name: "Test",
      ticker: "OU8",
      qty: 100,
      price: 1.5,
      sector: "",
    });
    expect(h.avgCost).toBe(1.5);
    expect(h.lastPrice).toBe(1.5);
    expect(h.market).toBe("SGX");
  });

  it("computes gain from avg cost and last price", () => {
    const h = normalizeHolding({
      ticker: "OU8",
      qty: 1000,
      avgCost: 1,
      lastPrice: 1.5,
      market: "SGX",
    });
    const g = holdingGain(h);
    expect(g.costBasis).toBe(1000);
    expect(g.marketValue).toBe(1500);
    expect(g.gain).toBe(500);
    expect(g.gainPct).toBeCloseTo(50, 1);
  });

  it("portfolioTotals matches DEFAULTS holdings", () => {
    const holdings = DEFAULTS.holdings;
    const t = portfolioTotals(holdings);
    expect(t.totalValue).toBeGreaterThan(0);
    expect(t.totalCost).toBe(t.totalValue);
  });

  it("appendPortfolioSnapshot dedupes same day", () => {
    const state = { ...DEFAULTS, portfolioHistory: [] };
    const totals = portfolioTotals(state.holdings);
    const h1 = appendPortfolioSnapshot(state, totals, "2026-05-22");
    const h2 = appendPortfolioSnapshot(
      { ...state, portfolioHistory: h1 },
      totals,
      "2026-05-22"
    );
    expect(h2).toHaveLength(1);
  });

  it("quoteSymbolsFromHoldings lists unique symbols", () => {
    const syms = quoteSymbolsFromHoldings(DEFAULTS.holdings);
    expect(syms).toContain("OU8.SI");
    expect(syms).toContain("T6I.SI");
  });
});
