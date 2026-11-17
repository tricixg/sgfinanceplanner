import { describe, expect, it } from "vitest";
import {
  addBalances,
  isInterestCreditMonth,
  monthlyCpfInterest,
  monthlyOaInterest,
  ZERO_BALANCES,
} from "./cpf-interest";

describe("monthlyCpfInterest", () => {
  it("OA earns 2.5% and MA 4% p.a. with no extra interest above the caps' reach (tiny balances aside)", () => {
    // OA 10,000 only: base 250/yr; extra 1% on the first 10,000 combined = 100/yr (credited to SA)
    const m = monthlyCpfInterest({ oa: 10_000, sa: 0, ma: 0 });
    expect(m.oa * 12).toBeCloseTo(250, 6);
    expect(m.sa * 12).toBeCloseTo(100, 6);
    expect(m.ma).toBe(0);
  });

  it("extra 1% applies to the first $60k combined, with OA counted up to $20k", () => {
    // OA 50k (counts 20k) + SA 30k + MA 20k = 70k eligible -> capped at 60k -> 600/yr extra
    const m = monthlyCpfInterest({ oa: 50_000, sa: 30_000, ma: 20_000 });
    expect(m.sa * 12).toBeCloseTo(30_000 * 0.04 + 600, 6);
    expect(m.oa * 12).toBeCloseTo(50_000 * 0.025, 6);
    expect(m.ma * 12).toBeCloseTo(20_000 * 0.04, 6);
  });

  it("OA above $20k does not add to the extra-interest base", () => {
    const a = monthlyCpfInterest({ oa: 20_000, sa: 0, ma: 0 });
    const b = monthlyCpfInterest({ oa: 80_000, sa: 0, ma: 0 });
    expect(b.sa).toBeCloseTo(a.sa, 10);
  });

  it("members 55+ earn a further 1% on the first $30k", () => {
    const young = monthlyCpfInterest({ oa: 0, sa: 40_000, ma: 0 }, 40);
    const senior = monthlyCpfInterest({ oa: 0, sa: 40_000, ma: 0 }, 56);
    expect((senior.sa - young.sa) * 12).toBeCloseTo(300, 6);
  });

  it("ignores negative balances", () => {
    expect(monthlyCpfInterest({ oa: -5, sa: -5, ma: -5 })).toEqual(ZERO_BALANCES);
  });
});

describe("helpers", () => {
  it("monthlyOaInterest is the base OA rate only", () => {
    expect(monthlyOaInterest(12_000) * 12).toBeCloseTo(300, 6);
  });
  it("addBalances / credit month", () => {
    expect(addBalances({ oa: 1, sa: 2, ma: 3 }, { oa: 1, sa: 1, ma: 1 })).toEqual({ oa: 2, sa: 3, ma: 4 });
    expect(isInterestCreditMonth("2026-12")).toBe(true);
    expect(isInterestCreditMonth("2026-11")).toBe(false);
  });
});
