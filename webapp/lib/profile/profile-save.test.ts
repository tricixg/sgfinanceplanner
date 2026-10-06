import { describe, expect, it } from "vitest";
import { mergeFinanceProfile } from "./load";

describe("mergeFinanceProfile", () => {
  const current = {
    monthlySal: 6500,
    salaryCreditDay: 25,
    oa: 50000,
    sa: 10000,
    ma: 8000,
    moo: 20000,
    margin: 0,
    cash: 0,
    ccDebt: 0,
    cashflowStartYm: "2026-05",
  };

  it("updates only salary without zeroing CPF", () => {
    const merged = mergeFinanceProfile(current, { monthlySal: 7000 });
    expect(merged.monthlySal).toBe(7000);
    expect(merged.oa).toBe(50000);
  });

  it("updates only oa without zeroing salary", () => {
    const merged = mergeFinanceProfile(current, { oa: 60000 });
    expect(merged.oa).toBe(60000);
    expect(merged.monthlySal).toBe(6500);
  });
});
