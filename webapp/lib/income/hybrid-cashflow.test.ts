import { describe, expect, it } from "vitest";
import { DEFAULTS } from "@/lib/finance/defaults";
import { buildMonths, stableTakeHome } from "@/lib/finance/cashflow";
import { monthCashIncome } from "@/lib/income/hybrid-cashflow";
import { currentYm } from "@/lib/finance/helpers";

describe("monthCashIncome", () => {
  it("adds additive deposits to baseline", () => {
    const base = stableTakeHome(DEFAULTS);
    const r = monthCashIncome(DEFAULTS, "2026-06", { "2026-06": 200 });
    expect(r.baseline).toBe(base);
    expect(r.additive).toBe(200);
    expect(r.total).toBe(base + 200);
  });

  it("uses actual salary/comms deposits as baseline for a past month", () => {
    const r = monthCashIncome(DEFAULTS, "2020-01", {}, { "2020-01": 4000 });
    expect(r.baseline).toBe(4000);
    expect(r.baselineIsActual).toBe(true);
  });

  it("falls back to projection for a past month with no actual data recorded", () => {
    const r = monthCashIncome(DEFAULTS, "2020-01", {}, {});
    expect(r.baseline).toBe(stableTakeHome(DEFAULTS));
    expect(r.baselineIsActual).toBe(false);
  });

  it("uses actual salary/comms deposits as baseline for the current month", () => {
    const ym = currentYm();
    const r = monthCashIncome(DEFAULTS, ym, {}, { [ym]: 4000 });
    expect(r.baseline).toBe(4000);
    expect(r.baselineIsActual).toBe(true);
  });

  it("keeps projection for a future month even if an actual entry exists", () => {
    const r = monthCashIncome(DEFAULTS, "2099-01", {}, { "2099-01": 4000 });
    expect(r.baseline).toBe(stableTakeHome(DEFAULTS));
    expect(r.baselineIsActual).toBe(false);
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
