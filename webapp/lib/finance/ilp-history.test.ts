import { describe, expect, it } from "vitest";
import { defaultIlpPolicy } from "./ilp";
import {
  estimatedNetPremiumsPaid,
  estimatedPremiumsPaid,
  ilpChartSeries,
  ilpProfit,
  recordIlpValueSnapshot,
} from "./ilp-history";

describe("ilp-history", () => {
  it("estimates premiums from policy start", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
    };
    expect(estimatedPremiumsPaid(p, "2026-06")).toBe(300 * 6);
  });

  it("ilpProfit is value minus net premiums", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
      accountValue: 5000,
    };
    expect(ilpProfit(p, "2026-06")).toBe(5000 - 1800);
  });

  it("initialBonus reduces net premiums for profit", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
      initialBonus: 500,
      accountValue: 5000,
    };
    expect(estimatedNetPremiumsPaid(p, "2026-06")).toBe(1300);
    expect(ilpProfit(p, "2026-06")).toBe(3700);
  });

  it("recordIlpValueSnapshot appends on change", () => {
    let p = { ...defaultIlpPolicy(), valueHistory: [] };
    p = recordIlpValueSnapshot(p, 1000, "2026-05-01");
    p = recordIlpValueSnapshot(p, 1200, "2026-06-01");
    expect(p.valueHistory).toHaveLength(2);
    p = recordIlpValueSnapshot(p, 1200, "2026-06-01");
    expect(p.valueHistory).toHaveLength(2);
  });

  it("ilpChartSeries needs at least two points", () => {
    const p = { ...defaultIlpPolicy(), valueHistory: [] };
    expect(ilpChartSeries(p)).toBeNull();
    const p2 = recordIlpValueSnapshot(p, 1000, "2026-01-01");
    const p3 = recordIlpValueSnapshot(p2, 1100, "2026-02-01");
    const series = ilpChartSeries(p3);
    expect(series?.labels).toHaveLength(2);
    expect(series?.values[1]).toBe(1100);
  });
});
