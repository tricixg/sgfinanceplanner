import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  computedLinesForMonth,
  liveComputedLines,
  pickComputedLines,
  type ComputedMonthMap,
} from "./computed-months";
import { budgetVerdict, computedDebtMonthly } from "./budget";
import { buildMonths } from "./cashflow";
import type { DashboardState } from "@/lib/types";

// FIN-005: finished months keep the premiums / loans they had; current and future months follow live settings.
const PAST = "2024-03";
const FUTURE = "2099-03";

const frozen: ComputedMonthMap = { [PAST]: { insurance: 100, ilp: 300, debt: 700 } };

const S: DashboardState = {
  ...DEFAULTS,
  insurancePolicies: [{ name: "A", insurer: "", monthlyPremium: 250, notes: "" }],
  ilpPolicies: [{ ...DEFAULTS.ilpPolicies[0], monthlyPremium: 400 }],
  loans: [{ name: "L", card: "C", monthly: 90, out: 900, end: "2099-12" }],
  otherLoans: [],
  computedMonths: frozen,
};

describe("computedLinesForMonth", () => {
  it("a past month with a snapshot keeps its frozen figures even after settings change", () => {
    expect(computedLinesForMonth(S, PAST)).toEqual({ insurance: 100, ilp: 300, debt: 700 });
  });

  it("a past month WITHOUT a snapshot falls back to live settings (previous behaviour)", () => {
    expect(computedLinesForMonth(S, "2024-04")).toEqual({ insurance: 250, ilp: 400, debt: 90 });
  });

  it("current and future months ignore snapshots and follow live settings", () => {
    const withFuture = { ...S, computedMonths: { ...frozen, [FUTURE]: { insurance: 1, ilp: 1, debt: 1 } } };
    expect(computedLinesForMonth(withFuture, FUTURE)).toEqual({ insurance: 250, ilp: 400, debt: 90 });
    expect(pickComputedLines(frozen, liveComputedLines(S, PAST), PAST, PAST)).toEqual(
      liveComputedLines(S, PAST)
    );
  });
});

describe("past months no longer change when settings change", () => {
  const edited: DashboardState = {
    ...S,
    insurancePolicies: [{ name: "A", insurer: "", monthlyPremium: 999, notes: "" }],
    loans: [],
  };

  it("budgetVerdict for a frozen month is identical before and after a premium change / loan removal", () => {
    const before = budgetVerdict(S, PAST);
    const after = budgetVerdict(edited, PAST);
    expect(after.insurance).toBe(100);
    expect(after.debt).toBe(700);
    expect(after.left).toBeCloseTo(before.left, 6);
  });

  it("budgetVerdict for the future month DOES follow the change", () => {
    expect(budgetVerdict(edited, FUTURE).insurance).toBe(999);
    expect(budgetVerdict(edited, FUTURE).debt).toBe(0);
  });

  it("computedDebtMonthly uses the frozen loan load", () => {
    expect(computedDebtMonthly(edited, PAST)).toBe(700);
  });

  it("cashflow rows for a frozen month use frozen figures; later months stay live", () => {
    const rows = buildMonths(edited, "2024-03", 2);
    expect(rows[0]).toMatchObject({ ym: PAST, insurance: 100, ilp: 300, loans: 700 });
    expect(rows[1]).toMatchObject({ ym: "2024-04", insurance: 999, loans: 0 }); // no snapshot → live
  });
});
