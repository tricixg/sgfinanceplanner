import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { simulate5y, simulateCPF } from "./projection";
import { netWorthTotal } from "./wealth";
import type { DashboardState } from "@/lib/types";
import type { OpenCycleEstimate } from "@/lib/cards/types";
import type { SavingsSnapshot } from "@/lib/savings/types";

const PARAMS = { growth: 3.5, invAdd: 0, invRet: 6, useMargin: true };

const TODAY = "2026-08-15";

const SAVINGS: SavingsSnapshot = {
  personalSavingsCash: 4000,
  personalNetWorthCash: 4000,
  personalCash: 4000,
  jointCash: 0,
  jointSavingsCash: 0,
  jointNetWorthCash: 0,
  personalMonthlySave: 0,
  jointMonthlySave: 0,
  personalFundsValue: 7500,
};

const CYCLE: OpenCycleEstimate = {
  creditCardId: "c1",
  creditCardKey: "card-1",
  cardName: "Card",
  statementCloseDate: "2026-09-01",
  cycleStartDate: "2026-08-02",
  cycleEndDate: "2026-09-01",
  carriedForward: 0,
  newSpend: 900,
  interestEstimate: 0,
  estimatedTotal: 900,
  daysLeftInCycle: 10,
};

// Loan end dates are far in the future so "active" doesn't depend on the real clock.
const FULL: DashboardState = {
  ...DEFAULTS,
  margin: 2000,
  insurancePolicies: [
    { name: "A", insurer: "", monthlyPremium: 60, notes: "" },
    { name: "B", insurer: "", monthlyPremium: 40, notes: "" },
  ],
  loans: [
    { name: "PPP", card: "Card", monthly: 100, out: 1200, end: "2099-12" },
  ],
  otherLoans: [
    {
      name: "Personal",
      loanType: "personal",
      principal: 6000,
      outstanding: 5000,
      interestRateApr: 0,
      feesPaid: 0,
      monthly: 250,
      amountPaid: 0,
    },
    {
      name: "BT",
      loanType: "balance_transfer",
      principal: 600,
      outstanding: 600,
      interestRateApr: 0,
      feesPaid: 0,
      monthly: 0,
      amountPaid: 0,
      sourceCreditCardId: "other-card",
    },
  ],
};

describe("simulate5y vs wealth page (FIN-001)", () => {
  it("'Now' net worth equals netWorthTotal for the same inputs", () => {
    const series = simulate5y(FULL, PARAMS, TODAY, SAVINGS, [CYCLE]);
    const expected = netWorthTotal(FULL, true, SAVINGS, [CYCLE]);
    expect(series[0].nw).toBeCloseTo(expected, 6);
  });

  it("'Now' matches with no savings snapshot / no card cycles too", () => {
    const series = simulate5y(FULL, PARAMS, TODAY);
    expect(series[0].nw).toBeCloseTo(netWorthTotal(FULL, true), 6);
  });

  it("includes funds, personal + BT loans and card balances in the starting position", () => {
    const withAll = simulate5y(FULL, PARAMS, TODAY, SAVINGS, [CYCLE])[0];
    const bare = simulate5y(
      { ...FULL, otherLoans: [] },
      PARAMS,
      TODAY,
      { ...SAVINGS, personalFundsValue: 0 },
      []
    )[0];
    // funds +7500 inv; personal 5000 + BT 600 + card 900 debt
    expect(withAll.inv - bare.inv).toBeCloseTo(7500, 6);
    expect(withAll.debt - bare.debt).toBeCloseTo(5000 + 600 + 900, 6);
  });

  it("an excludeFromNetWorth personal loan stays out of debt, like Wealth", () => {
    const S: DashboardState = {
      ...FULL,
      otherLoans: FULL.otherLoans.map((l) =>
        l.loanType === "personal" ? { ...l, excludeFromNetWorth: true } : l
      ),
    };
    const series = simulate5y(S, PARAMS, TODAY, SAVINGS, [CYCLE]);
    expect(series[0].nw).toBeCloseTo(netWorthTotal(S, true, SAVINGS, [CYCLE]), 6);
  });

  it("ignores instalment loans with monthly = 0, like Wealth", () => {
    const S: DashboardState = {
      ...FULL,
      loans: [{ name: "Zero", card: "Card", monthly: 0, out: 777, end: "2099-12" }],
    };
    const series = simulate5y(S, PARAMS, TODAY, SAVINGS, [CYCLE]);
    expect(series[0].nw).toBeCloseTo(netWorthTotal(S, true, SAVINGS, [CYCLE]), 6);
  });
});

describe("simulate5y projected cash (FIN-001)", () => {
  const last = (S: DashboardState) =>
    simulate5y(S, PARAMS, TODAY, SAVINGS, [CYCLE]).at(-1)!;

  it("subtracts insurance premiums every month (Aug 2026 – Dec 2031 = 65 months)", () => {
    const noIns = last({ ...FULL, insurancePolicies: [] });
    const withIns = last(FULL);
    expect(noIns.cash - withIns.cash).toBeCloseTo(100 * 65, 6);
  });

  it("subtracts personal-loan repayments until the loan is paid off, and pays the balance down", () => {
    const noLoan = last({
      ...FULL,
      otherLoans: FULL.otherLoans.filter((l) => l.loanType !== "personal"),
    });
    const withLoan = last(FULL);
    // $5,000 at $250/month = 20 payments: exactly the balance leaves cash, not 250 × 65.
    expect(noLoan.cash - withLoan.cash).toBeCloseTo(5000, 6);
    // Paid off by 2031, so no personal debt remains: debt is identical.
    expect(withLoan.debt).toBeCloseTo(noLoan.debt, 6);
    // Repaying the loan moves $5,000 from cash to debt reduction (neutral), so the
    // only net-worth difference left is the $5,000 the loan already cost "Now".
    expect(withLoan.nw).toBeCloseTo(noLoan.nw - 5000, 6);
  });

  it("keeps BT loans and card balances flat", () => {
    const row = last(FULL);
    const noHeld = last({
      ...FULL,
      otherLoans: FULL.otherLoans.filter((l) => l.loanType !== "balance_transfer"),
    });
    expect(row.debt - noHeld.debt).toBeCloseTo(600, 6);
  });
});

describe("simulate5y", () => {
  it("starts from the given today, not a fixed calendar date", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2026-08-15");
    expect(series[0].label).toBe("Now");
    expect(series[series.length - 1].label).toBe("2031");
  });

  it("shifts the whole 5-year window when today is a different year", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2030-01-01");
    expect(series[series.length - 1].label).toBe("2035");
  });

  it("still produces a full window for a today far past the old hardcoded end date", () => {
    const series = simulate5y(DEFAULTS, PARAMS, "2033-06-01");
    expect(series.length).toBeGreaterThan(1);
    expect(series[series.length - 1].label).toBe("2038");
  });
});

describe("simulateCPF", () => {
  it("starts from the given today, not a fixed calendar date", () => {
    const series = simulateCPF(DEFAULTS, 3.5, "2026-08-15");
    expect(series[0].label).toBe("Now");
    expect(series[series.length - 1].label).toBe("2031");
  });

  it("shifts the whole 5-year window when today is a different year", () => {
    const series = simulateCPF(DEFAULTS, 3.5, "2030-01-01");
    expect(series[series.length - 1].label).toBe("2035");
  });
});
