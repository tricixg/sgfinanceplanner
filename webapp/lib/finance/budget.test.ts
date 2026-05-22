import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { monthlyInvestContribution, monthlySaveContribution } from "./budget";

describe("monthlyInvestContribution", () => {
  it("sums invest-type budget lines", () => {
    expect(monthlyInvestContribution(DEFAULTS)).toBe(1300);
    expect(monthlySaveContribution(DEFAULTS)).toBe(900);
  });
});
