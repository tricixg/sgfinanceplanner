import { describe, expect, it } from "vitest";
import { computeBTO } from "./bto";

// Everything happens at month 0 so no bills are drawn; only the "latest keys"
// path (undrawn OA growing to month 23) is exercised. Calendar starts 2026-01,
// so month 11 is December 2026 and month 23 is December 2027.
const base = {
  price: 500000,
  rate: 2.6,
  tenure: 25,
  bookingOffsetMonths: 0,
  aflOffsetMonths: 0,
  kcOffsetMonths: 0,
  latestKcOffsetMonths: 23,
  optionFee: 2000,
  legalFee: 650,
  staggered: false,
  maxLoanEligible: 0,
  schemes: { ehg: { enabled: false, amountOverride: null } },
  tSal: 0,
  pSal: 0,
  tOA: 100_000,
  pOA: 0,
  tOAMonthly: 0,
  pOAMonthly: 0,
  todayYm: "2026-01",
};

const balanceAt = (b: ReturnType<typeof computeBTO>, month: number) =>
  b.pooledSeries.find((p) => p.month === month)!.balance;

describe("BTO OA growth uses CPF's interest model (FIN-003)", () => {
  it("accrued interest is not spendable until credited in December", () => {
    const b = computeBTO(base);
    expect(balanceAt(b, 10)).toBeCloseTo(100_000, 6); // Nov 2026: nothing credited yet
    expect(balanceAt(b, 11)).toBeCloseTo(100_000 + (100_000 * 0.025 * 11) / 12, 6); // Dec 2026 credit
  });

  it("credits a year at a time, with no compounding within the year", () => {
    const b = computeBTO(base);
    const afterFirst = 100_000 + (100_000 * 0.025 * 11) / 12;
    // Jan–Dec 2027 = 12 months on the (credited) balance
    expect(balanceAt(b, 23)).toBeCloseTo(afterFirst * 1.025, 6);
    // monthly compounding would have given 100,000 × (1 + 0.025/12)^23
    expect(Math.abs(balanceAt(b, 23) - 100_000 * Math.pow(1 + 0.025 / 12, 23))).toBeGreaterThan(10);
  });

  it("a contribution earns from the month after it arrives", () => {
    const b = computeBTO({ ...base, tOA: 0, tOAMonthly: 1000 });
    const interest1 = (55_000 * 0.025) / 12; // opening balances 0, 1,000 … 10,000 (months 1–11)
    const dec2026 = 11_000 + interest1;
    const interest2 = ((12 * dec2026 + 1000 * 66) * 0.025) / 12; // months 12–23
    expect(balanceAt(b, 11)).toBeCloseTo(dec2026, 6);
    expect(balanceAt(b, 23)).toBeCloseTo(dec2026 + 12_000 + interest2, 6);
  });

  it("keeps self and partner shares summing to the pooled balance", () => {
    const b = computeBTO({ ...base, pOA: 40_000, tOAMonthly: 500, pOAMonthly: 300 });
    for (const p of b.pooledSeries) expect(p.to + p.po).toBeCloseTo(p.balance, 6);
  });

  it("with bills drawn at AFL and key collection, to + po still equals the pool and interest stays uncredited until December", () => {
    const b = computeBTO({
      ...base,
      aflOffsetMonths: 5,
      kcOffsetMonths: 14,
      latestKcOffsetMonths: 20,
      pOA: 40_000,
      tOAMonthly: 500,
      pOAMonthly: 300,
    });
    for (const p of b.pooledSeries) expect(p.to + p.po).toBeCloseTo(p.balance, 6);
    // Dec 2026 (month 11) is the first credit, so the pool just before it carries no interest:
    // opening 140,000 + 10 months × 800 inflow − AFL draw
    const before = b.pooledSeries.find((p) => p.month === 10)!.balance;
    expect(before).toBeCloseTo(140_000 + 10 * 800 - b.cpfUsedAFL, 6);
  });
});
