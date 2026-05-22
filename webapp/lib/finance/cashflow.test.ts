import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { buildMonths, loanLoadForMonth, stableTakeHome } from "./cashflow";

describe("cashflow", () => {
  it("stable take-home matches base minus CPF plus comms", () => {
    const th = stableTakeHome(DEFAULTS);
    expect(th).toBeCloseTo(5365, -1);
  });

  it("loan load drops when loans end before month", () => {
    const loadJun = loanLoadForMonth(DEFAULTS.loans, "2026-06");
    const loadNov = loanLoadForMonth(DEFAULTS.loans, "2026-11");
    expect(loadNov).toBeLessThan(loadJun);
  });

  it("buildMonths returns five months from start", () => {
    const rows = buildMonths(DEFAULTS, "2026-06", 5);
    expect(rows).toHaveLength(5);
    expect(rows[0].m).toBe("Jun 26");
    expect(rows.every((r) => r.income === stableTakeHome(DEFAULTS))).toBe(true);
  });
});
