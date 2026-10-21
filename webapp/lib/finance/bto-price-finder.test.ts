import { describe, expect, it } from "vitest";
import { computeBTO, resolveBtoOAMonthly, resolveBtoPlannerPrefs } from "./bto";
import { btoAffordabilityZone, btoPriceBands } from "./bto-price-finder";
import { cpfOAmonthly } from "./cpf";

const base = {
  rate: 2.6,
  tenure: 25,
  bookingOffsetMonths: 1,
  aflOffsetMonths: 10,
  kcOffsetMonths: 59,
  latestKcOffsetMonths: 77,
  optionFee: 2000,
  legalFee: 650,
  staggered: false,
  maxLoanEligible: 0,
  schemes: { ehg: { enabled: false, amountOverride: null } },
  tSal: 6500,
  pSal: 4300,
  tOA: 30000,
  pOA: 14575,
  tOAMonthly: cpfOAmonthly(6500),
  pOAMonthly: cpfOAmonthly(4300),
};

describe("btoAffordabilityZone", () => {
  it("classifies a cheap flat as fully CPF and an expensive one as a stretch", () => {
    expect(btoAffordabilityZone(computeBTO({ ...base, price: 350000 }), 0)).toBe("cpf");
    expect(btoAffordabilityZone(computeBTO({ ...base, price: 900000 }), 0)).toBe("stretch");
  });

  it("counts cash savings toward the 'cash' zone", () => {
    const b = computeBTO({ ...base, price: 650000 });
    expect(b.totalCash).toBeGreaterThan(b.optionFee);
    expect(btoAffordabilityZone(b, b.totalCash)).not.toBe("stretch");
    expect(btoAffordabilityZone(b, 0)).toBe("stretch");
  });

  it("is a stretch whenever OA inflow can't cover the mortgage", () => {
    const b = computeBTO({ ...base, price: 400000, tOAMonthly: 100, pOAMonthly: 100, tOA: 500000 });
    expect(b.mortOK).toBe(false);
    expect(btoAffordabilityZone(b, 1e9)).toBe("stretch");
  });

  it("uses 'cpf-late' when only the latest key date lets OA catch up", () => {
    // Loan capped at $250k → a big KC top-up that OA covers only after the estimated date.
    const b = computeBTO({ ...base, price: 500000, tOA: 40000, maxLoanEligible: 250000 });
    expect(b.cashAFL).toBe(0);
    expect(b.cashKC).toBeGreaterThan(0);
    expect(b.latestKcOK).toBe(true);
    expect(btoAffordabilityZone(b, 0)).toBe("cpf-late");
  });
});

describe("btoPriceBands", () => {
  it("returns ascending grid rows and nested max prices (cpf ≤ cpf-late ≤ cash)", () => {
    const bands = btoPriceBands(base, 20000, { min: 300000, max: 900000, step: 5000 });
    expect(bands.grid).toHaveLength(121);
    expect(bands.grid[0].price).toBe(300000);
    expect(bands.grid.at(-1)!.price).toBe(900000);
    const { cpf, "cpf-late": late, cash } = bands.maxPrice;
    expect(cpf).not.toBeNull();
    expect(late!).toBeGreaterThanOrEqual(cpf!);
    expect(cash!).toBeGreaterThanOrEqual(late!);
  });

  it("more cash savings never lowers the cash-zone ceiling", () => {
    const range = { min: 300000, max: 900000, step: 5000 };
    const low = btoPriceBands(base, 0, range).maxPrice.cash ?? 0;
    const high = btoPriceBands(base, 100000, range).maxPrice.cash ?? 0;
    expect(high).toBeGreaterThanOrEqual(low);
  });
});

describe("computeBTO pooledSeries", () => {
  it("runs month by month to the latest key date without drawing the KC bill", () => {
    const b = computeBTO({ ...base, price: 580000 });
    expect(b.pooledSeries[0].month).toBe(0);
    expect(b.pooledSeries.at(-1)!.month).toBe(77);
    const atKc = b.pooledSeries.find((s) => s.month === 59)!;
    expect(atKc.balance).toBeCloseTo(b.cpfAvailKC, 5);
    expect(b.pooledSeries.at(-1)!.balance).toBeCloseTo(b.cpfAvailLatestKC, 5);
    // Bill due switches from the AFL bill to the KC bill at AFL.
    expect(b.pooledSeries.find((s) => s.month === 9)!.due).toBeCloseTo(b.neededAFL, 5);
    expect(b.pooledSeries.find((s) => s.month === 10)!.due).toBeCloseTo(b.neededKC, 5);
  });
});

describe("resolveBtoOAMonthly / resolveBtoPlannerPrefs", () => {
  it("resolves each person's OA growth mode independently", () => {
    const p = {
      tOaGrowthMode: "contributions" as const,
      pOaGrowthMode: "salary" as const,
      tOAMonthly: 900,
      pOAMonthly: 700,
      tSal: 6500,
      pSal: 4300,
    };
    expect(resolveBtoOAMonthly(p, { self: 1234, partner: null })).toEqual({
      tOAMonthly: 1234,
      pOAMonthly: cpfOAmonthly(4300),
    });
    expect(resolveBtoOAMonthly(p, { self: null, partner: null }).tOAMonthly).toBe(900);
  });

  it("lets shared household fields win over the personal profile", () => {
    const prefs = resolveBtoPlannerPrefs(
      { btoPlanner: undefined, monthlySal: 6000, oa: 10000 },
      { price: 612000, keysDateLatest: "2033-03-31" }
    );
    expect(prefs.price).toBe(612000);
    expect(prefs.keysDateLatest).toBe("2033-03-31");
  });
});

describe("grant fixed from the HFE letter", () => {
  it("keeps the letter's grant even when today's income is above the EHG ceiling", () => {
    const schemes = { ehg: { enabled: true, amountOverride: 10000 } };
    const b = computeBTO({ ...base, price: 580000, schemes });
    expect(base.tSal + base.pSal).toBeGreaterThan(9000);
    expect(b.totalGrants).toBe(10000);
    const noGrant = computeBTO({ ...base, price: 580000 });
    expect(b.cpfAvailAFL - noGrant.cpfAvailAFL).toBeGreaterThan(10000);
  });
});
