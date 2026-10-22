import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import type { DashboardState } from "@/lib/types";
import {
  defaultIlpPolicy,
  estimatedNetPremiumsPaid,
  estimatedPremiumsPaid,
  ilpProfit,
  ilpValueByLock,
} from "./ilp";
import { wealthSummary } from "./wealth";

describe("ilp premiums and profit", () => {
  it("estimates premiums from policy start", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
    };
    expect(estimatedPremiumsPaid(p, "2026-06")).toBe(300 * 5);
  });

  it("ilpProfit is value minus net premiums", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
      accountValue: 5000,
    };
    expect(ilpProfit(p, "2026-06")).toBe(5000 - 1500);
  });

  it("initialBonus reduces net premiums for profit", () => {
    const p = {
      ...defaultIlpPolicy(),
      policyStartYm: "2026-01",
      monthlyPremium: 300,
      initialBonus: 500,
      accountValue: 5000,
    };
    expect(estimatedNetPremiumsPaid(p, "2026-06")).toBe(1000);
    expect(ilpProfit(p, "2026-06")).toBe(4000);
  });
});

describe("ilpValueByLock", () => {
  it("treats policies past lock-in end as spendable", () => {
    const S: DashboardState = {
      ...DEFAULTS,
      ilpPolicies: [
        {
          ...DEFAULTS.ilpPolicies[0],
          accountValue: 5000,
          lockInEndYm: "2020-01",
        },
      ],
    };
    expect(ilpValueByLock(S, "2026-05")).toEqual({
      total: 5000,
      spendable: 5000,
      locked: 0,
    });
  });

  it("excludes locked policies from spendable split", () => {
    const S: DashboardState = {
      ...DEFAULTS,
      ilpPolicies: [
        {
          ...DEFAULTS.ilpPolicies[0],
          accountValue: 3000,
          lockInEndYm: "2030-06",
        },
        {
          ...DEFAULTS.ilpPolicies[0],
          insurer: "Other",
          accountValue: 2000,
          lockInEndYm: "2024-01",
        },
      ],
    };
    expect(ilpValueByLock(S, "2026-05")).toEqual({
      total: 5000,
      spendable: 2000,
      locked: 3000,
    });
  });

  it("wealthSummary net worth includes locked ILP in total", () => {
    const S: DashboardState = {
      ...DEFAULTS,
      ilpPolicies: [
        {
          ...DEFAULTS.ilpPolicies[0],
          accountValue: 8000,
          lockInEndYm: "2030-01",
        },
      ],
    };
    const { lnw, ilpLocked, invTotal, cash, liab } = wealthSummary(S);
    expect(ilpLocked).toBe(8000);
    expect(lnw).toBeCloseTo(invTotal + cash - liab, 2);
  });
});
