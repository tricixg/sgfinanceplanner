import { describe, expect, it } from "vitest";
import { calcEhgFamilyGrant, defaultBTOSchemes, totalHousingGrants } from "./bto-schemes";
import {
  buildBTOStages,
  buildBTOTimeline,
  computeBTO,
  formatCountdown,
  normalizeBTOSchemes,
  normalizeBtoPlannerPrefs,
  splitSharedBtoFields,
} from "./bto";

const noGrantSchemes = { ehg: { enabled: false, amountOverride: null } };

describe("BTO schemes", () => {
  it("EHG tiers by household income", () => {
    expect(calcEhgFamilyGrant(1400)).toBe(80000);
    expect(calcEhgFamilyGrant(6500 + 4300)).toBe(0);
    expect(calcEhgFamilyGrant(4000)).toBeGreaterThan(0);
  });

  it("timeline derives dates from application month, months to AFL, and years to keys", () => {
    const t = buildBTOTimeline("2026-06", 5, 4);
    expect(t.application).toMatch(/Jun.*26/i);
    expect(t.afl).toMatch(/Mar 27/i);
    expect(t.keys).toMatch(/Jun 30/i);
  });

  it("normalizeBTOSchemes fills the ehg key and preserves overrides", () => {
    const fromEmpty = normalizeBTOSchemes(null);
    expect(fromEmpty.ehg).toEqual({ enabled: true, amountOverride: null });

    const schemes = normalizeBTOSchemes({ ehg: { enabled: false, amountOverride: 5000 } });
    expect(schemes.ehg).toEqual({ enabled: false, amountOverride: 5000 });
    expect(totalHousingGrants(schemes, { tSal: 2000, pSal: 1500 })).toBe(0);
  });

  it("normalizeBtoPlannerPrefs backfills new fields with sane defaults", () => {
    const p = normalizeBtoPlannerPrefs(
      { price: 500000 },
      { monthlySal: 6000, oa: 10000 }
    );
    expect(p.schemes.ehg).toBeDefined();
    expect(p.projectName.length).toBeGreaterThan(0);
    expect(p.price).toBe(500000);
    expect(p.monthsToAFL).toBeGreaterThan(0);
    expect(p.optionFee).toBeGreaterThan(0);
    expect(p.legalFee).toBeGreaterThan(0);
    expect(p.staggered).toBe(false);
    expect(p.maxLoanEligible).toBe(0);
    expect(p.tOaGrowthMode).toBe("salary");
    expect(p.pOaGrowthMode).toBe("salary");
    expect(p.tOAMonthly).toBeGreaterThan(0);
    expect(p.pOAMonthly).toBeGreaterThan(0);
    expect(p.queueNumber).toBe(0);
    expect(p.queueTotal).toBe(0);
    expect(p.aflDateActual).toBe("");
  });

  it("preserves an explicitly blank projectName override as the default (falls back)", () => {
    const p = normalizeBtoPlannerPrefs(
      { projectName: "  " },
      { monthlySal: 6000, oa: 10000 }
    );
    expect(p.projectName.length).toBeGreaterThan(0);
  });

  it("keeps a custom projectName when set", () => {
    const p = normalizeBtoPlannerPrefs(
      { projectName: "My BTO" },
      { monthlySal: 6000, oa: 10000 }
    );
    expect(p.projectName).toBe("My BTO");
  });

  it("splitSharedBtoFields extracts only the household-shared subset", () => {
    const p = normalizeBtoPlannerPrefs(
      { queueNumber: 527, queueTotal: 988, tSal: 9999 },
      { monthlySal: 6000, oa: 10000 }
    );
    const shared = splitSharedBtoFields(p);
    expect(shared.queueNumber).toBe(527);
    expect(shared.queueTotal).toBe(988);
    expect(shared.price).toBe(p.price);
    expect("tSal" in shared).toBe(false);
    expect("pOA" in shared).toBe(false);
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
      monthsToAFL: 5,
      optionFee: 2000,
      legalFee: 650,
      staggered: false,
      maxLoanEligible: 0,
      schemes,
      tSal: 2000,
      pSal: 1500,
      pOA: 0,
      tOA: 20000,
      tOAMonthly: 400,
      pOAMonthly: 300,
    });
    expect(b.totalGrants).toBe(grants);
    expect(b.netPrice).toBe(580000 - grants);
    expect(b.loan).toBeCloseTo(b.netPrice * 0.75, 0);
  });
});

describe("formatCountdown", () => {
  it("labels today, future, and past deltas", () => {
    expect(formatCountdown(0)).toBe("Today");
    expect(formatCountdown(1)).toBe("in 1 day");
    expect(formatCountdown(-1)).toBe("1 day ago");
    expect(formatCountdown(45)).toBe("in 45 days");
    expect(formatCountdown(-45)).toBe("45 days ago");
    expect(formatCountdown(91)).toMatch(/^in ~3 months$/);
    expect(formatCountdown(-91)).toMatch(/^~3 months ago$/);
  });
});

describe("buildBTOStages", () => {
  const prefs = {
    applicationYm: "2026-01",
    monthsToAFL: 5,
    yrsToKeys: 4,
    bookingDateActual: "",
    aflDateActual: "",
    keysDateActual: "",
  };

  it("marks application done and the next unpassed estimate as next", () => {
    const stages = buildBTOStages(prefs, "2026-01-01");
    const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
    expect(byId.application.status).toBe("done");
    expect(byId.booking.status).toBe("next");
    expect(byId.afl.status).toBe("upcoming");
    expect(byId.keys.status).toBe("upcoming");
    expect(byId.mortgage.status).toBe("upcoming");
    expect(byId.booking.isActual).toBe(false);
  });

  it("advances the next-stage pointer as estimated dates pass", () => {
    const stages = buildBTOStages(prefs, "2026-06-01");
    const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
    expect(byId.booking.status).toBe("done");
    expect(byId.afl.status).toBe("next");
  });

  it("marks mortgage active once key collection has passed", () => {
    const stages = buildBTOStages(prefs, "2031-01-01");
    const byId = Object.fromEntries(stages.map((s) => [s.id, s]));
    expect(byId.keys.status).toBe("done");
    expect(byId.mortgage.status).toBe("active");
  });

  it("prefers an actual date over the estimate when set", () => {
    const withActual = { ...prefs, bookingDateActual: "2026-03-01" };
    const stages = buildBTOStages(withActual, "2026-01-01");
    const booking = stages.find((s) => s.id === "booking")!;
    expect(booking.isActual).toBe(true);
    expect(booking.dateYmd).toBe("2026-03-01");
    expect(booking.status).toBe("next");
  });
});

describe("computeBTO payment waterfall", () => {
  const common = {
    price: 500000,
    ltv: 75,
    rate: 2.6,
    tenure: 25,
    yrsToKeys: 4,
    monthsToAFL: 5,
    optionFee: 2000,
    legalFee: 650,
    schemes: noGrantSchemes,
    tSal: 6000,
    pSal: 4000,
  };

  it("staggered scheme shifts more of the same total downpayment to key collection", () => {
    const shared = { ...common, pOA: 10000, tOA: 20000, tOAMonthly: 800, pOAMonthly: 600 };
    const normal = computeBTO({ ...shared, staggered: false, maxLoanEligible: 0 });
    const staggered = computeBTO({ ...shared, staggered: true, maxLoanEligible: 0 });

    expect(normal.dpAFL + normal.dpKC).toBeCloseTo(staggered.dpAFL + staggered.dpKC, 5);
    expect(staggered.dpAFL).toBeLessThan(normal.dpAFL);
    expect(staggered.dpKC).toBeGreaterThan(normal.dpKC);
  });

  it("falls back to cash for any remainder when CPF OA can't cover a stage", () => {
    const b = computeBTO({
      ...common,
      staggered: false,
      maxLoanEligible: 0,
      pOA: 0,
      tOA: 0,
      tOAMonthly: 0,
      pOAMonthly: 0,
    });
    expect(b.cpfUsedAFL).toBe(0);
    expect(b.cashAFL).toBeCloseTo(b.dpAFL + b.bsd + b.legalFee, 5);
    expect(b.cpfUsedKC).toBe(0);
    expect(b.cashKC).toBeCloseTo(b.dpKC, 5);
    expect(b.dpOK).toBe(false);
  });

  it("draws CPF first and covers the downpayment fully when balances are large", () => {
    const b = computeBTO({
      ...common,
      price: 400000,
      staggered: false,
      maxLoanEligible: 0,
      pOA: 200000,
      tOA: 200000,
      tOAMonthly: 500,
      pOAMonthly: 500,
    });
    expect(b.cashAFL).toBe(0);
    expect(b.cashKC).toBe(0);
    expect(b.dpOK).toBe(true);
    expect(b.balAfterKC).toBeGreaterThan(0);
  });

  it("caps the loan at the assessed max eligible amount and grows the downpayment", () => {
    const shared = {
      ...common,
      price: 600000,
      staggered: false,
      pOA: 50000,
      tOA: 50000,
      tOAMonthly: 500,
      pOAMonthly: 500,
    };
    const uncapped = computeBTO({ ...shared, maxLoanEligible: 0 });
    const capped = computeBTO({ ...shared, maxLoanEligible: 300000 });

    expect(uncapped.loanCapped).toBe(false);
    expect(uncapped.loan).toBeCloseTo(uncapped.netPrice * 0.75, 0);
    expect(capped.loanCapped).toBe(true);
    expect(capped.loan).toBe(300000);
    expect(capped.dpTotal).toBeCloseTo(capped.netPrice - 300000, 5);
    expect(capped.dpAFL + capped.dpKC).toBeGreaterThan(uncapped.dpAFL + uncapped.dpKC);
  });
});
