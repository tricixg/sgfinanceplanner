import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  liabilityBreakdown,
  migrateHoldings,
  netWorthSlices,
  netWorthTotal,
  portfolioInvestmentValue,
  portfolioValue,
  wealthSummary,
} from "./wealth";
import type { OtherLoan } from "@/lib/other-loans/types";
import type { OpenCycleEstimate } from "@/lib/cards/types";

/**
 * `creditCardId` (a UUID in real data) and `creditCardKey` (the human `card_key`)
 * are deliberately DIFFERENT strings here — sourceCreditCardId on a BT loan is
 * actually a card_key, and a prior bug matched it against creditCardId instead,
 * which test fixtures using the same value for both would never have caught.
 */
function openCycle(
  overrides: Partial<OpenCycleEstimate> & { cardKey: string; estimatedTotal: number }
): OpenCycleEstimate {
  const { cardKey, ...rest } = overrides;
  return {
    creditCardId: `uuid-${cardKey}`,
    creditCardKey: cardKey,
    cardName: cardKey,
    statementCloseDate: "2026-08-01",
    cycleStartDate: "2026-07-02",
    cycleEndDate: "2026-08-01",
    carriedForward: 0,
    newSpend: 0,
    interestEstimate: 0,
    daysLeftInCycle: 0,
    ...rest,
  };
}

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
      loans: [],
      otherLoans: [
        {
          name: "Personal",
          loanType: "personal" as const,
          principal: 5000,
          outstanding: 5000,
          interestRateApr: 0,
          feesPaid: 0,
          monthly: 0,
          amountPaid: 0,
          excludeFromNetWorth: true,
        },
      ],
    };
    const { lnw, liab } = wealthSummary(withLoan);
    expect(liab).toBe(0);
    const baseline = wealthSummary({ ...DEFAULTS, margin: 0, loans: [], otherLoans: [] });
    expect(lnw).toBeCloseTo(baseline.lnw, 2);
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
      personalFundsValue: 0,
    };
    const { cash, personalCash } = wealthSummary(DEFAULTS, savings);
    expect(cash).toBe(800);
    expect(personalCash).toBe(800);
    const slice = netWorthSlices(DEFAULTS, false, savings).find(
      (s) => s.label === "Cash accounts"
    );
    expect(slice?.value).toBe(800);
  });

  it("fund balances count toward invTotal, lnw, and the Funds slice", () => {
    const savings = {
      personalSavingsCash: 0,
      personalNetWorthCash: 0,
      personalCash: 0,
      jointCash: 0,
      jointSavingsCash: 0,
      jointNetWorthCash: 0,
      personalMonthlySave: 0,
      jointMonthlySave: 0,
      personalFundsValue: 1500,
    };
    const { fundsVal, invTotal, lnw } = wealthSummary(DEFAULTS, savings);
    const baseline = wealthSummary(DEFAULTS);
    expect(fundsVal).toBe(1500);
    expect(invTotal).toBeCloseTo(baseline.invTotal + 1500, 2);
    expect(lnw).toBeCloseTo(baseline.lnw + 1500, 2);
    const slice = netWorthSlices(DEFAULTS, false, savings).find(
      (s) => s.label === "Funds"
    );
    expect(slice?.value).toBe(1500);
  });
});

describe("liabilityBreakdown", () => {
  it("counts a card with no linked BT loan in full", () => {
    const lines = liabilityBreakdown(
      { ...DEFAULTS, margin: 0, loans: [], otherLoans: [] },
      [openCycle({ cardKey: "card-a", estimatedTotal: 1000 })]
    );
    expect(lines.find((l) => l.key === "cardBalances")?.amount).toBe(1000);
    expect(lines.find((l) => l.key === "btLoans")?.amount).toBe(0);
  });

  it("nets a linked BT loan out of its card's balance with no overlap and no gap", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 400, outstanding: 400,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-a",
    };
    const lines = liabilityBreakdown(
      { ...DEFAULTS, margin: 0, loans: [], otherLoans: [bt] },
      [openCycle({ cardKey: "card-a", estimatedTotal: 1000 })]
    );
    const cardBalances = lines.find((l) => l.key === "cardBalances")?.amount ?? 0;
    const btLoans = lines.find((l) => l.key === "btLoans")?.amount ?? 0;
    expect(cardBalances).toBe(600);
    expect(btLoans).toBe(400);
    expect(cardBalances + btLoans).toBe(1000);
  });

  it("clamps card balance to 0 when BT outstanding exceeds the card's current total", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 500, outstanding: 500,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-a",
    };
    const lines = liabilityBreakdown(
      { ...DEFAULTS, margin: 0, loans: [], otherLoans: [bt] },
      [openCycle({ cardKey: "card-a", estimatedTotal: 300 })]
    );
    expect(lines.find((l) => l.key === "cardBalances")?.amount).toBe(0);
    expect(lines.find((l) => l.key === "btLoans")?.amount).toBe(500);
  });

  it("keeps two cards independent — BT on one card doesn't net the other", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 400, outstanding: 400,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-a",
    };
    const lines = liabilityBreakdown(
      { ...DEFAULTS, margin: 0, loans: [], otherLoans: [bt] },
      [
        openCycle({ cardKey: "card-a", estimatedTotal: 1000 }),
        openCycle({ cardKey: "card-b", estimatedTotal: 500 }),
      ]
    );
    expect(lines.find((l) => l.key === "cardBalances")?.amount).toBe(1100);
  });

  it("counts an unlinked BT loan fully but nets no card", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 200, outstanding: 200,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const lines = liabilityBreakdown(
      { ...DEFAULTS, margin: 0, loans: [], otherLoans: [bt] },
      [openCycle({ cardKey: "card-a", estimatedTotal: 1000 })]
    );
    expect(lines.find((l) => l.key === "cardBalances")?.amount).toBe(1000);
    expect(lines.find((l) => l.key === "btLoans")?.amount).toBe(200);
  });

  it("counts instalment loans now, unlike before this fix", () => {
    const lines = liabilityBreakdown({ ...DEFAULTS, margin: 0, otherLoans: [] }, []);
    expect(lines.find((l) => l.key === "instalmentLoans")?.amount ?? 0).toBeGreaterThan(0);
  });

  it("wealthSummary.liab always equals the sum of liabilityBreakdown's lines", () => {
    const openCycles = [openCycle({ cardKey: "card-a", estimatedTotal: 1000 })];
    const { liab, liabLines } = wealthSummary({ ...DEFAULTS, margin: 500 }, null, openCycles);
    expect(liab).toBe(liabLines.reduce((s, l) => s + l.amount, 0));
  });

  it("wealthSummary works without an openCycles argument (backward compatible)", () => {
    expect(() => wealthSummary(DEFAULTS)).not.toThrow();
    const { liabLines } = wealthSummary(DEFAULTS);
    expect(liabLines.find((l) => l.key === "cardBalances")?.amount).toBe(0);
  });
});
