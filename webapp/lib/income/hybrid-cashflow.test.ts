import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@/lib/finance/defaults";
import { buildMonths, stableTakeHome } from "@/lib/finance/cashflow";
import { monthCashIncome } from "@/lib/income/hybrid-cashflow";

describe("monthCashIncome", () => {
  it("adds additive deposits to baseline", () => {
    const base = stableTakeHome(DEFAULTS);
    const r = monthCashIncome(DEFAULTS, "2026-06", { "2026-06": 200 });
    expect(r.baseline).toBe(base);
    expect(r.additive).toBe(200);
    expect(r.total).toBe(base + 200);
  });
});

describe("buildMonths hybrid", () => {
  it("includes additive income per month", () => {
    const rows = buildMonths(DEFAULTS, "2026-06", 5, null, {
      "2026-07": 500,
    });
    const july = rows.find((r) => r.ym === "2026-07");
    expect(july?.incomeBaseline).toBe(stableTakeHome(DEFAULTS));
    expect(july?.incomeAdditive).toBe(500);
    expect(july?.income).toBe(stableTakeHome(DEFAULTS) + 500);
  });
});
