import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { build5m, loanLoadForMonth, stableTakeHome } from "./cashflow";

describe("cashflow", () => {
  it("stable take-home matches TW base minus CPF plus comms", () => {
    const th = stableTakeHome(DEFAULTS);
    expect(th).toBeCloseTo(5365, -1);
  });

  it("loan load drops when loans end before month", () => {
    const loadJun = loanLoadForMonth(DEFAULTS.loans, "2026-06");
    const loadNov = loanLoadForMonth(DEFAULTS.loans, "2026-11");
    expect(loadNov).toBeLessThan(loadJun);
  });

  it("build5m returns five months", () => {
    const rows = build5m(DEFAULTS);
    expect(rows).toHaveLength(5);
    expect(rows[0].m).toBe("Jun 26");
  });
});
