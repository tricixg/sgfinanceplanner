import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { buildMonths, loanLoadForMonth, stableTakeHome } from "./cashflow";

describe("cashflow", () => {
  it("stable take-home matches base minus CPF (comms no longer counted as baseline)", () => {
    const th = stableTakeHome(DEFAULTS);
    expect(th).toBeCloseTo(5200, -1);
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
    expect(rows.every((r) => r.incomeBaseline === stableTakeHome(DEFAULTS))).toBe(true);
    expect(rows.every((r) => r.income === r.incomeBaseline)).toBe(true);
  });

  it("buildMonths uses each month's own budget", () => {
    const S = {
      ...DEFAULTS,
      budgetMonths: {
        "2026-11": [{ id: "a", cat: "Rent", amt: 100, type: "fixed" as const }],
        "2026-12": [{ id: "a", cat: "Rent", amt: 250, type: "fixed" as const }],
      },
    };
    expect(buildMonths(S, "2026-11", 3).map((r) => r.fixed)).toEqual([100, 250, 250]);
  });
});
