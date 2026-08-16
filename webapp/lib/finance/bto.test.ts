import { describe, expect, it } from "vitest";
import { calcEhgFamilyGrant, defaultBTOSchemes, totalHousingGrants } from "./bto-schemes";
import {
  buildBTOStages,
  computeBTO,
  formatCountdown,
  normalizeBTOSchemes,
  normalizeBtoPlannerPrefs,
  resolveBTOMonthOffsets,
  splitSharedBtoFields,
} from "./bto";

const noGrantSchemes = { ehg: { enabled: false, amountOverride: null } };

describe("BTO schemes", () => {
  it("EHG tiers by household income", () => {
    expect(calcEhgFamilyGrant(1400)).toBe(80000);
    expect(calcEhgFamilyGrant(6500 + 4300)).toBe(0);
    expect(calcEhgFamilyGrant(4000)).toBeGreaterThan(0);
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

  it("grants reduce the informational net price but not the loan/BSD/downpayment — they credit CPF OA instead", () => {
    const base = {
      price: 580000,
      ltv: 75,
      rate: 2.6,
      tenure: 25,
      bookingOffsetMonths: 4,
      aflOffsetMonths: 9,
      kcOffsetMonths: 48,
      optionFee: 2000,
      legalFee: 650,
      staggered: false,
      maxLoanEligible: 0,
      tSal: 2000,
      pSal: 1500,
      pOA: 0,
      tOA: 20000,
      tOAMonthly: 400,
      pOAMonthly: 300,
    };
    const schemes = defaultBTOSchemes();
    const grants = totalHousingGrants(schemes, { tSal: 2000, pSal: 1500 });
    expect(grants).toBeGreaterThan(0);

    const withGrants = computeBTO({ ...base, schemes });
    const withoutGrants = computeBTO({ ...base, schemes: noGrantSchemes });

    expect(withGrants.totalGrants).toBe(grants);
    expect(withGrants.netPrice).toBe(580000 - grants);

    // Loan eligibility, BSD, and the downpayment percentages are all based on
    // the full price — grants don't change any of them.
    expect(withGrants.loan).toBeCloseTo(withoutGrants.loan, 5);
    expect(withGrants.loan).toBeCloseTo(580000 * 0.75, 0);
    expect(withGrants.bsd).toBeCloseTo(withoutGrants.bsd, 5);
    expect(withGrants.dpAFL).toBeCloseTo(withoutGrants.dpAFL, 5);

    // Grants instead show up as extra CPF OA available to pay the bills.
    expect(withGrants.cpfAvailAFL).toBeGreaterThan(withoutGrants.cpfAvailAFL);
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

  it("shifts the AFL estimate to follow an overridden booking date, not the application month", () => {
    // Default (no override): booking estimate is Jan + 4mo = May; AFL estimate
    // is booking + 5mo = Oct.
    const withoutOverride = buildBTOStages(prefs, "2026-01-01");
    expect(withoutOverride.find((s) => s.id === "afl")!.estimatedYm).toBe("2026-10");

    // Booking moved earlier via an actual date (Jan instead of the May
    // estimate) — the AFL estimate should follow it (Jan + 5mo = Jun), not
    // stay anchored to the old application-derived schedule (Oct).
    const withEarlyBooking = { ...prefs, bookingDateActual: "2026-01-01" };
    const stages = buildBTOStages(withEarlyBooking, "2026-01-01");
    expect(stages.find((s) => s.id === "afl")!.estimatedYm).toBe("2026-06");
  });
});

describe("resolveBTOMonthOffsets", () => {
  const prefs = {
    applicationYm: "2026-01",
    monthsToAFL: 5,
    yrsToKeys: 4,
    bookingDateActual: "",
    aflDateActual: "",
    keysDateActual: "",
  };

  it("counts months from today to the resolved dates, not from the application month", () => {
    // Booking estimate: Jan + 4mo = May. AFL estimate: booking (May) + 5mo =
    // Oct 2026. From "today" = Jun 2026 that is ~1 month to booking and ~4
    // months to AFL, not 9 (which application+offset would give if today
    // were mistaken for the application month).
    const { bookingOffsetMonths, aflOffsetMonths, kcOffsetMonths } = resolveBTOMonthOffsets(
      prefs,
      "2026-06-01"
    );
    expect(bookingOffsetMonths).toBeGreaterThanOrEqual(0);
    expect(aflOffsetMonths).toBeCloseTo(4, 0);
    expect(kcOffsetMonths).toBeGreaterThan(aflOffsetMonths);
  });

  it("follows actual AFL/key-collection dates instead of the estimates when set", () => {
    const withActual = { ...prefs, aflDateActual: "2026-07-01", keysDateActual: "2026-08-01" };
    const { aflOffsetMonths, kcOffsetMonths } = resolveBTOMonthOffsets(withActual, "2026-06-01");
    expect(aflOffsetMonths).toBeCloseTo(1, 0);
    expect(kcOffsetMonths).toBeCloseTo(2, 0);
  });

  it("never lets the key-collection offset land before the AFL offset, or booking before AFL", () => {
    // Data-entry inconsistency: an actual KC date earlier than the AFL estimate,
    // and a booking date later than the AFL estimate.
    const inconsistent = {
      ...prefs,
      keysDateActual: "2026-02-01",
      bookingDateActual: "2026-12-01",
    };
    const { bookingOffsetMonths, aflOffsetMonths, kcOffsetMonths } = resolveBTOMonthOffsets(
      inconsistent,
      "2026-01-01"
    );
    expect(kcOffsetMonths).toBeGreaterThanOrEqual(aflOffsetMonths);
    expect(bookingOffsetMonths).toBeLessThanOrEqual(aflOffsetMonths);
  });
});

describe("computeBTO payment waterfall", () => {
  const common = {
    price: 500000,
    ltv: 75,
    rate: 2.6,
    tenure: 25,
    bookingOffsetMonths: 4,
    aflOffsetMonths: 9,
    kcOffsetMonths: 48,
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

  it("AFL downpayment is a flat 5%/10% of price, and credits the option fee already paid", () => {
    const shared = { ...common, maxLoanEligible: 0, pOA: 0, tOA: 0, tOAMonthly: 0, pOAMonthly: 0 };
    const staggered = computeBTO({ ...shared, staggered: true });
    const normal = computeBTO({ ...shared, staggered: false });

    expect(staggered.dpAFL).toBeCloseTo(common.price * 0.05, 5);
    expect(normal.dpAFL).toBeCloseTo(common.price * 0.1, 5);

    // Cash due at AFL = the flat downpayment, minus the option fee already
    // paid at booking (credited against the price), plus BSD and legal fee.
    expect(staggered.cashAFL).toBeCloseTo(
      staggered.dpAFL - common.optionFee + staggered.bsd + staggered.legalFee,
      5
    );
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
    // AFL cash is net of the option fee, already credited against the price.
    expect(b.cashAFL).toBeCloseTo(b.dpAFL - common.optionFee + b.bsd + b.legalFee, 5);
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
    expect(uncapped.loan).toBeCloseTo(shared.price * 0.75, 0);
    expect(capped.loanCapped).toBe(true);
    expect(capped.loan).toBe(300000);
    expect(capped.dpTotal).toBeCloseTo(shared.price - 300000, 5);
    expect(capped.dpAFL + capped.dpKC).toBeGreaterThan(uncapped.dpAFL + uncapped.dpKC);

    // HDB's AFL downpayment is a flat 10%/5% of price — capping the loan
    // must NOT change it; the whole shortfall lands on key collection.
    expect(capped.dpAFL).toBeCloseTo(uncapped.dpAFL, 5);
    expect(capped.dpAFL).toBeCloseTo(shared.price * 0.1, 5);
    expect(capped.dpKC).toBeGreaterThan(uncapped.dpKC);
    expect(capped.loanShortfall).toBeCloseTo(uncapped.loan - 300000, 5);
  });

  it("labels Booking/AFL/Key Collection as chart milestones and shows the drawdown at each payment", () => {
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

    expect(b.labels).toContain("Booking");
    expect(b.labels).toContain("AFL");
    expect(b.labels).toContain("AFL (paid)");
    expect(b.labels).toContain("Key collection");
    expect(b.labels).toContain("Key collection (paid)");

    const aflIdx = b.labels.indexOf("AFL");
    const aflPaidIdx = b.labels.indexOf("AFL (paid)");
    const beforeAFL = b.tSeries[aflIdx] + b.pSeries[aflIdx];
    const afterAFL = b.tSeries[aflPaidIdx] + b.pSeries[aflPaidIdx];
    expect(beforeAFL - afterAFL).toBeCloseTo(b.cpfUsedAFL, 2);

    const kcIdx = b.labels.indexOf("Key collection");
    const kcPaidIdx = b.labels.indexOf("Key collection (paid)");
    const beforeKC = b.tSeries[kcIdx] + b.pSeries[kcIdx];
    const afterKC = b.tSeries[kcPaidIdx] + b.pSeries[kcPaidIdx];
    expect(beforeKC - afterKC).toBeCloseTo(b.cpfUsedKC, 2);

    // neededSeries: starts at the AFL bill (net of the option fee credit),
    // steps to the KC bill right after AFL is paid, and to 0 once KC is paid too.
    expect(b.neededSeries[0]).toBeCloseTo(
      b.dpAFL - common.optionFee + b.bsd + b.legalFee,
      5
    );
    expect(b.neededSeries[aflPaidIdx]).toBeCloseTo(b.dpKC, 5);
    expect(b.neededSeries[kcPaidIdx]).toBe(0);
  });
});
