/**
 * Bank loan for an HDB flat, taken at key collection instead of an HDB loan.
 * MAS / HDB rules applied (as of 2026):
 * - Mortgage Servicing Ratio: instalment ≤ 30% of gross monthly household income
 * - Total Debt Servicing Ratio: all debt repayments ≤ 55% of income
 * - Both are tested at MAS's 4% medium-term interest rate floor, not the actual rate
 * - Max tenure 30 years for HDB flats; LTV 75% (needs tenure to end by age 65)
 * - At least 5% of the price must be paid in cash
 */
export const BANK_LOAN_RULES = {
  msr: 0.3,
  tdsr: 0.55,
  stressRatePct: 4,
  maxTenureYears: 30,
  maxLtv: 0.75,
  minCashPct: 0.05,
} as const;

/** Largest loan whose monthly instalment is `payment`, at `ratePct` p.a. over `years`. */
export function loanFromPayment(payment: number, ratePct: number, years: number): number {
  const n = years * 12;
  const r = ratePct / 1200;
  if (payment <= 0 || n <= 0) return 0;
  return r > 0 ? (payment * (1 - Math.pow(1 + r, -n))) / r : payment * n;
}

export type BankLoanCapacity = {
  /** Max loan banks will offer on income alone (before the 75% LTV cap). */
  maxLoan: number;
  /** Max monthly instalment allowed at the stress rate. */
  maxPayment: number;
  msrPayment: number;
  tdsrPayment: number;
  /** Which ratio limits the loan. */
  binding: "msr" | "tdsr";
  tenureYears: number;
};

/**
 * Max bank loan at key collection from gross monthly household income and
 * debt repayments still running at that point (card instalments, personal loans).
 */
export function bankLoanCapacity(opts: {
  monthlyIncome: number;
  otherDebtMonthly: number;
  tenureYears: number;
}): BankLoanCapacity {
  const { msr, tdsr, stressRatePct, maxTenureYears } = BANK_LOAN_RULES;
  const tenureYears = Math.min(Math.max(1, opts.tenureYears), maxTenureYears);
  const msrPayment = opts.monthlyIncome * msr;
  const tdsrPayment = Math.max(0, opts.monthlyIncome * tdsr - opts.otherDebtMonthly);
  const maxPayment = Math.min(msrPayment, tdsrPayment);
  return {
    maxLoan: loanFromPayment(maxPayment, stressRatePct, tenureYears),
    maxPayment,
    msrPayment,
    tdsrPayment,
    binding: tdsrPayment < msrPayment ? "tdsr" : "msr",
    tenureYears,
  };
}
