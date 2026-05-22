import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { budgetVerdict } from "./budget";
import {
  computedInsuranceMonthly,
  migrateInsurancePolicies,
} from "./insurance";

describe("insurance", () => {
  it("migrates legacy eci/tpd/acc into policies", () => {
    const policies = migrateInsurancePolicies({
      eci: 10,
      tpd: 20,
      acc: 5,
    });
    expect(policies).toHaveLength(3);
    expect(computedInsuranceMonthly({ ...DEFAULTS, insurancePolicies: policies })).toBe(
      35
    );
  });

  it("budgetVerdict subtracts insurance from ME tab", () => {
    const { insurance, left } = budgetVerdict(DEFAULTS);
    expect(insurance).toBeCloseTo(163.83, 2);
    expect(left).toBeLessThan(budgetVerdict({
      ...DEFAULTS,
      insurancePolicies: [],
    }).left);
  });
});
