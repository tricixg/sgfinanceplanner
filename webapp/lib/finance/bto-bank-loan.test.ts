import { describe, expect, it } from "vitest";
import { BANK_LOAN_RULES, bankLoanCapacity, loanFromPayment } from "./bto-bank-loan";
import { btoLoanTerms, computeBTO, normalizeBtoPlannerPrefs } from "./bto";
import { btoAffordabilityZone } from "./bto-price-finder";

/** Standard annuity instalment — the inverse of loanFromPayment. */
const instalment = (loan: number, ratePct: number, years: number) => {
  const r = ratePct / 1200;
  const n = years * 12;
  return (loan * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};

describe("bankLoanCapacity", () => {
  it("sizes the loan so the 4% stress-test instalment equals 30% of income", () => {
    const cap = bankLoanCapacity({ monthlyIncome: 10800, otherDebtMonthly: 0, tenureYears: 30 });
    expect(cap.binding).toBe("msr");
    expect(cap.maxPayment).toBeCloseTo(3240, 5);
    expect(instalment(cap.maxLoan, BANK_LOAN_RULES.stressRatePct, 30)).toBeCloseTo(3240, 2);
    expect(cap.maxLoan).toBeGreaterThan(670000);
    expect(cap.maxLoan).toBeLessThan(690000);
  });

  it("switches to the 55% total-debt limit when other loans are large", () => {
    const cap = bankLoanCapacity({ monthlyIncome: 10000, otherDebtMonthly: 3000, tenureYears: 30 });
    expect(cap.binding).toBe("tdsr");
    expect(cap.maxPayment).toBeCloseTo(2500, 5);
  });

  it("caps tenure at 30 years", () => {
    const cap = bankLoanCapacity({ monthlyIncome: 8000, otherDebtMonthly: 0, tenureYears: 35 });
    expect(cap.tenureYears).toBe(30);
  });

  it("loanFromPayment handles zero payment and zero rate", () => {
    expect(loanFromPayment(0, 4, 30)).toBe(0);
    expect(loanFromPayment(1000, 0, 10)).toBe(120000);
  });
});

describe("btoLoanTerms", () => {
  const prefs = normalizeBtoPlannerPrefs(
    { tSal: 6500, pSal: 4300, maxLoanEligible: 420000, rate: 2.6, tenure: 25, bankRate: 2.8, bankTenure: 30 },
    { monthlySal: 6500, oa: 0 }
  );

  it("uses the HLE amount and HDB terms for an HDB loan", () => {
    const t = btoLoanTerms({ ...prefs, loanAtKeys: "hdb" }, { otherDebtMonthly: 0 });
    expect(t).toMatchObject({ rate: 2.6, tenure: 25, maxLoanEligible: 420000, minCashPct: 0 });
  });

  it("uses income-based capacity, bank terms and 5% cash for a bank loan", () => {
    const t = btoLoanTerms({ ...prefs, loanAtKeys: "bank" }, { otherDebtMonthly: 0 });
    expect(t.rate).toBe(2.8);
    expect(t.tenure).toBe(30);
    expect(t.maxLoanEligible).toBeCloseTo(t.bank.maxLoan, 5);
    expect(t.minCashPct).toBe(0.05);
  });
});

describe("computeBTO with a bank loan's 5% cash minimum", () => {
  const base = {
    price: 600000,
    rate: 2.8,
    tenure: 30,
    bookingOffsetMonths: 1,
    aflOffsetMonths: 10,
    kcOffsetMonths: 59,
    latestKcOffsetMonths: 77,
    optionFee: 2000,
    legalFee: 650,
    staggered: false,
    maxLoanEligible: 0,
    schemes: { ehg: { enabled: false, amountOverride: null } },
    tSal: 6500,
    pSal: 4300,
    tOA: 400000,
    pOA: 0,
    tOAMonthly: 1500,
    pOAMonthly: 1000,
  };

  it("forces the rest of the 5% into cash at key collection even when OA could cover it", () => {
    const hdb = computeBTO(base);
    const bank = computeBTO({ ...base, minCashPct: 0.05 });
    expect(hdb.cashKC).toBe(0);
    expect(bank.mandatoryCashKC).toBeCloseTo(600000 * 0.05 - 2000, 5);
    expect(bank.cashKC).toBeCloseTo(bank.mandatoryCashKC, 5);
    expect(bank.totalCash).toBeCloseTo(600000 * 0.05, 5);
    // CPF still covers everything it's allowed to.
    expect(bank.dpOK).toBe(true);
    expect(bank.latestKcOK).toBe(true);
  });

  it("is only 'CPF + 5% cash' when savings cover the mandatory cash", () => {
    const bank = computeBTO({ ...base, minCashPct: 0.05 });
    expect(btoAffordabilityZone(bank, 30000)).toBe("cpf");
    expect(btoAffordabilityZone(bank, 10000)).toBe("stretch");
  });
});
