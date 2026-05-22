import { describe, expect, it } from "vitest";
import {
  calcEhgFamilyGrant,
  defaultBTOSchemes,
  totalHousingGrants,
} from "./bto-schemes";
import { buildBTOTimeline, computeBTO } from "./bto";

describe("BTO schemes", () => {
  it("EHG tiers by household income", () => {
    expect(calcEhgFamilyGrant(1400)).toBe(80000);
    expect(calcEhgFamilyGrant(6500 + 4300)).toBe(0);
    expect(calcEhgFamilyGrant(4000)).toBeGreaterThan(0);
  });

  it("timeline derives dates from application month", () => {
    const t = buildBTOTimeline("2026-06", 4);
    expect(t.application).toMatch(/Jun.*26/i);
    expect(t.keys).toMatch(/Jun 30/i);
  });

  it("grants reduce net price and loan", () => {
    const schemes = defaultBTOSchemes();
    const grants = totalHousingGrants(schemes, { tSal: 2000, pSal: 1500 });
    const b = computeBTO({
      price: 580000,
      ltv: 75,
      rate: 2.6,
      tenure: 25,
      yrsToKeys: 4,
      schemes,
      tSal: 2000,
      pSal: 1500,
      pOA: 0,
      tOA: 20000,
    });
    expect(b.totalGrants).toBe(grants);
    expect(b.netPrice).toBe(580000 - grants);
    expect(b.loan).toBeCloseTo(b.netPrice * 0.75, 0);
  });
});
