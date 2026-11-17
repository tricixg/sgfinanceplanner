import { describe, expect, it } from "vitest";
import { cpfEmp, cpfTotal } from "./cpf";

describe("cpf", () => {
  it("computes employee CPF at $6,500 salary", () => {
    expect(cpfEmp(6500)).toBeCloseTo(1300, 0);
  });

  it("computes total CPF at $6,500 (37%)", () => {
    expect(cpfTotal(6500)).toBeCloseTo(2405, 0);
  });

  it("caps ordinary wages at $8,000 ceiling", () => {
    expect(cpfTotal(10000)).toBe(cpfTotal(8000));
  });
});

import {
  CPF_RATE_BANDS,
  cpfAgeForMonth,
  cpfAllocate,
  cpfBandForAge,
  cpfOAmonthly,
} from "./cpf";

describe("cpf by age (FIN-003)", () => {
  it("every band's allocation sums to 1", () => {
    for (const b of CPF_RATE_BANDS) {
      const { oa, sa, ma } = b.allocation;
      expect(oa + sa + ma).toBeCloseTo(1, 4);
    }
  });

  it("unknown age keeps the previous (35 and below) behaviour", () => {
    expect(cpfTotal(6500)).toBe(cpfTotal(6500, 30));
    expect(cpfAllocate(6500).oa).toBeCloseTo(6500 * 0.37 * 0.6217, 6);
    expect(cpfOAmonthly(6500)).toBeCloseTo(cpfOAmonthly(6500, 35), 6);
  });

  it.each([
    [35, 0.6217], [36, 0.5677], [45, 0.5677], [46, 0.5136],
    [50, 0.5136], [51, 0.4055], [55, 0.4055], [56, 0.353], [60, 0.353], [61, 0.14],
    [65, 0.14], [80, 0.14],
  ])("age %i uses OA share %f", (age, oaShare) => {
    expect(cpfBandForAge(age).allocation.oa).toBe(oaShare);
  });

  it("uses age-specific employee / total rates (55–60: 18% + 16%; 60–65: 12.5% + 12.5%)", () => {
    expect(cpfEmp(6000, 40)).toBeCloseTo(1200, 6);
    expect(cpfEmp(6000, 58)).toBeCloseTo(1080, 6);
    expect(cpfTotal(6000, 58)).toBeCloseTo(2040, 6);
    expect(cpfEmp(6000, 62)).toBeCloseTo(750, 6);
    expect(cpfTotal(6000, 62)).toBeCloseTo(1500, 6);
  });

  it("OA credit at $6,500 falls from age 35 to 40 to 52 (example numbers)", () => {
    expect(cpfOAmonthly(6500, 30)).toBeCloseTo(2405 * 0.6217, 6);
    expect(cpfOAmonthly(6500, 40)).toBeCloseTo(2405 * 0.5677, 6);
    expect(cpfOAmonthly(6500, 52)).toBeCloseTo(2405 * 0.4055, 6);
  });

  it("age changes the month AFTER the birthday month", () => {
    // turns 36 on 2026-06-15 → age on 31 May is 35, on 30 Jun is 36
    expect(cpfAgeForMonth("1990-06-15", "2026-06")).toBe(35);
    expect(cpfAgeForMonth("1990-06-15", "2026-07")).toBe(36);
    expect(cpfBandForAge(cpfAgeForMonth("1990-06-15", "2026-06")).allocation.oa).toBe(0.6217);
    expect(cpfBandForAge(cpfAgeForMonth("1990-06-15", "2026-07")).allocation.oa).toBe(0.5677);
  });

  it("handles January (previous month is last December) and bad input", () => {
    expect(cpfAgeForMonth("1990-12-31", "2026-01")).toBe(35);
    expect(cpfAgeForMonth("", "2026-01")).toBeNull();
    expect(cpfAgeForMonth("nonsense", "2026-01")).toBeNull();
    expect(cpfAgeForMonth(undefined, "2026-01")).toBeNull();
  });
});
