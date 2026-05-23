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

  it("net worth cash slice includes all cash accounts", () => {
    const slices = netWorthSlices(DEFAULTS, false);
    expect(slices.find((s) => s.label === "Cash accounts")?.value).toBe(2500);
  });

  it("net worth omits personal loans excluded from net worth", () => {
    const withLoan = {
      ...DEFAULTS,
      margin: 0,
      ccDebt: 0,
      otherLoans: [
        {
          name: "Personal",
          loanType: "personal" as const,
          principal: 5000,
          outstanding: 5000,
          interestRateApr: 0,
          feesPaid: 0,
          amountPaid: 0,
          excludeFromNetWorth: true,
        },
      ],
    };
    const { lnw, liab } = wealthSummary(withLoan);
    expect(liab).toBe(0);
    expect(lnw).toBeCloseTo(wealthSummary(DEFAULTS).lnw, 2);
  });

  it("net worth includes accounts excluded from savings totals", () => {
    const savings = {
      personalSavingsCash: 0,
      personalNetWorthCash: 800,
      personalCash: 0,
      jointCash: 0,
      jointSavingsCash: 0,
      jointNetWorthCash: 0,
      personalMonthlySave: 0,
      jointMonthlySave: 0,
    };
    const { cash, personalCash } = wealthSummary(DEFAULTS, savings);
    expect(cash).toBe(800);
    expect(personalCash).toBe(800);
    const slice = netWorthSlices(DEFAULTS, false, savings).find(
      (s) => s.label === "Cash accounts"
    );
    expect(slice?.value).toBe(800);
  });
});
