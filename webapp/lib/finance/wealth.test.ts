import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  migrateHoldings,
  netWorthSlices,
  netWorthTotal,
  portfolioInvestmentValue,
  portfolioValue,
  wealthSummary,
} from "./wealth";

describe("portfolioInvestmentValue", () => {
  it("uses sum of holdings when lines exist", () => {
    expect(portfolioValue(DEFAULTS.holdings)).toBeCloseTo(25185.5, 2);
    expect(portfolioInvestmentValue(DEFAULTS)).toBeCloseTo(25185.5, 2);
  });

  it("migrates legacy moo when holdings are empty", () => {
    const holdings = migrateHoldings({ moo: 5000, holdings: [] });
    expect(holdings).toHaveLength(1);
    expect(portfolioValue(holdings)).toBe(5000);
  });

  it("wealthSummary port matches calculated holdings", () => {
    const { port } = wealthSummary(DEFAULTS);
    expect(port).toBeCloseTo(portfolioInvestmentValue(DEFAULTS), 2);
  });

  it("netWorthTotal adds CPF when requested", () => {
    const { lnw, cpf } = wealthSummary(DEFAULTS);
    expect(netWorthTotal(DEFAULTS, false)).toBeCloseTo(lnw, 2);
    expect(netWorthTotal(DEFAULTS, true)).toBeCloseTo(lnw + cpf, 2);
  });

  it("netWorthSlices includes CPF slice only when toggled", () => {
    const exclCpf = netWorthSlices(DEFAULTS, false).map((s) => s.label);
    const inclCpf = netWorthSlices(DEFAULTS, true).map((s) => s.label);
    expect(exclCpf).not.toContain("CPF");
    expect(inclCpf).toContain("CPF");
  });

  it("net worth cash slice uses savings accounts", () => {
    const slices = netWorthSlices(DEFAULTS, false);
    expect(slices.find((s) => s.label === "Savings accounts")?.value).toBe(2500);
  });
});
