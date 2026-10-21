import type { BtoLoanType, BtoOAGrowthMode, BtoPlannerPrefs, DashboardState } from "@/lib/types";
import { addMonthsYm, daysBetweenYmd } from "./calendar";
import { cpfOAmonthly } from "./cpf";
import {
  BTO_SCHEME_DEFS,
  defaultBTOSchemes,
  totalHousingGrants,
  type BTOSchemeSelection,
} from "./bto-schemes";
import { fmt } from "./helpers";
import { BANK_LOAN_RULES, bankLoanCapacity, type BankLoanCapacity } from "./bto-bank-loan";

/** Months from BTO application to the booking (1st) appointment. */
const BOOKING_OFFSET_MONTHS = 4;

/** HDB's fixed max loan-to-value ratio — not something a buyer can choose. */
const MAX_HDB_LTV = 0.75;

/**
 * BtoPlannerPrefs fields that describe the flat/application itself rather
 * than either person — shared across a linked household via
 * household_bto_planner instead of each user's own profile. Salary, own OA
 * growth mode, and manual OA figures stay personal (per user).
 */
export const SHARED_BTO_FIELD_KEYS = [
  "projectName",
  "price",
  "rate",
  "tenure",
  "yrsToKeys",
  "applicationYm",
  "monthsToAFL",
  "optionFee",
  "legalFee",
  "staggered",
  "maxLoanEligible",
  "queueNumber",
  "queueTotal",
  "bookingDateActual",
  "aflDateActual",
  "keysDateActual",
  "keysDateLatest",
  "loanAtKeys",
  "bankRate",
  "bankTenure",
  "schemes",
] as const satisfies readonly (keyof BtoPlannerPrefs)[];

export type SharedBtoPlannerFields = Pick<
  BtoPlannerPrefs,
  (typeof SHARED_BTO_FIELD_KEYS)[number]
>;

export function splitSharedBtoFields(prefs: BtoPlannerPrefs): SharedBtoPlannerFields {
  const out = {} as SharedBtoPlannerFields;
  for (const key of SHARED_BTO_FIELD_KEYS) {
    (out as Record<string, unknown>)[key] = prefs[key];
  }
  return out;
}

export type BTOInputs = {
  price: number;
  rate: number;
  tenure: number;
  optionFee: number;
  legalFee: number;
  staggered: boolean;
  maxLoanEligible: number;
  schemes: BTOSchemeSelection;
  tSal: number;
  pSal: number;
  pOA: number;
  tOA: number;
  /** Resolved monthly OA contribution for self/partner — already mode-resolved by the caller. */
  tOAMonthly: number;
  pOAMonthly: number;
  /** Months from today to the resolved Booking/AFL/key-collection dates — already resolved by the caller via resolveBTOMonthOffsets. */
  bookingOffsetMonths: number;
  aflOffsetMonths: number;
  kcOffsetMonths: number;
  /** Months from today to HDB's latest key collection date — omit to skip the latest-date check. */
  latestKcOffsetMonths?: number;
  /**
   * Minimum share of the price that must be paid in cash (bank loans: 0.05).
   * Counts the option fee and any AFL cash already paid; the rest is forced
   * into the key-collection payment. Omit / 0 for HDB loans.
   */
  minCashPct?: number;
  /**
   * Monthly OA contribution for self/partner in month `m` from today, for
   * projections where pay changes over time (the income goal). Defaults to
   * the flat tOAMonthly / pOAMonthly.
   */
  oaMonthlyAt?: (m: number) => { t: number; p: number };
};

export { defaultBTOSchemes, BTO_SCHEME_DEFS } from "./bto-schemes";

/** Merge persisted schemes with defaults (fixes prod profiles missing keys or `schemes`). */
export function normalizeBTOSchemes(
  partial?: Partial<BTOSchemeSelection> | null
): BTOSchemeSelection {
  const defaults = defaultBTOSchemes();
  if (!partial || typeof partial !== "object") {
    return defaults;
  }
  const out = { ...defaults };
  for (const def of BTO_SCHEME_DEFS) {
    const row = partial[def.id];
    if (row && typeof row === "object") {
      out[def.id] = {
        enabled: Boolean(row.enabled),
        amountOverride:
          row.amountOverride != null && row.amountOverride >= 0
            ? row.amountOverride
            : null,
      };
    }
  }
  return out;
}

const OA_GROWTH_MODES: BtoOAGrowthMode[] = ["salary", "manual", "contributions"];

export function normalizeBtoPlannerPrefs(
  raw: Partial<BtoPlannerPrefs> | null | undefined,
  opts: { monthlySal: number; oa: number }
): BtoPlannerPrefs {
  const base = defaultBtoPlannerPrefs({ monthlySal: opts.monthlySal, oa: opts.oa });
  if (!raw || typeof raw !== "object") {
    return base;
  }
  return {
    projectName:
      typeof raw.projectName === "string" && raw.projectName.trim().length > 0
        ? raw.projectName
        : base.projectName,
    price: typeof raw.price === "number" ? raw.price : base.price,
    rate: typeof raw.rate === "number" ? raw.rate : base.rate,
    tenure: typeof raw.tenure === "number" ? raw.tenure : base.tenure,
    yrsToKeys: typeof raw.yrsToKeys === "number" ? raw.yrsToKeys : base.yrsToKeys,
    applicationYm:
      typeof raw.applicationYm === "string" && raw.applicationYm.length >= 7
        ? raw.applicationYm
        : base.applicationYm,
    monthsToAFL: typeof raw.monthsToAFL === "number" ? raw.monthsToAFL : base.monthsToAFL,
    optionFee: typeof raw.optionFee === "number" ? raw.optionFee : base.optionFee,
    legalFee: typeof raw.legalFee === "number" ? raw.legalFee : base.legalFee,
    staggered: typeof raw.staggered === "boolean" ? raw.staggered : base.staggered,
    maxLoanEligible:
      typeof raw.maxLoanEligible === "number" ? raw.maxLoanEligible : base.maxLoanEligible,
    tSal: typeof raw.tSal === "number" ? raw.tSal : base.tSal,
    pSal: typeof raw.pSal === "number" ? raw.pSal : base.pSal,
    pOA: typeof raw.pOA === "number" ? raw.pOA : base.pOA,
    tOaGrowthMode:
      typeof raw.tOaGrowthMode === "string" &&
      OA_GROWTH_MODES.includes(raw.tOaGrowthMode as BtoOAGrowthMode)
        ? (raw.tOaGrowthMode as BtoOAGrowthMode)
        : base.tOaGrowthMode,
    pOaGrowthMode:
      typeof raw.pOaGrowthMode === "string" &&
      OA_GROWTH_MODES.includes(raw.pOaGrowthMode as BtoOAGrowthMode)
        ? (raw.pOaGrowthMode as BtoOAGrowthMode)
        : base.pOaGrowthMode,
    tOAMonthly: typeof raw.tOAMonthly === "number" ? raw.tOAMonthly : base.tOAMonthly,
    pOAMonthly: typeof raw.pOAMonthly === "number" ? raw.pOAMonthly : base.pOAMonthly,
    queueNumber: typeof raw.queueNumber === "number" ? raw.queueNumber : base.queueNumber,
    queueTotal: typeof raw.queueTotal === "number" ? raw.queueTotal : base.queueTotal,
    bookingDateActual:
      typeof raw.bookingDateActual === "string" ? raw.bookingDateActual : base.bookingDateActual,
    aflDateActual:
      typeof raw.aflDateActual === "string" ? raw.aflDateActual : base.aflDateActual,
    keysDateActual:
      typeof raw.keysDateActual === "string" ? raw.keysDateActual : base.keysDateActual,
    keysDateLatest:
      typeof raw.keysDateLatest === "string" ? raw.keysDateLatest : base.keysDateLatest,
    loanAtKeys:
      raw.loanAtKeys === "hdb" || raw.loanAtKeys === "bank"
        ? (raw.loanAtKeys as BtoLoanType)
        : base.loanAtKeys,
    bankRate: typeof raw.bankRate === "number" ? raw.bankRate : base.bankRate,
    bankTenure: typeof raw.bankTenure === "number" ? raw.bankTenure : base.bankTenure,
    schemes: normalizeBTOSchemes(raw.schemes),
  };
}

/**
 * Merges the household's shared BTO fields (project name, price, grants,
 * loan terms, timeline) over the user's own personal fields (salary, OA
 * growth mode) before normalizing — shared data wins when it's loaded, so
 * both linked partners see and edit the same scenario.
 */
export function resolveBtoPlannerPrefs(
  S: Pick<DashboardState, "btoPlanner" | "monthlySal" | "oa">,
  sharedRaw: Partial<SharedBtoPlannerFields> | null
): BtoPlannerPrefs {
  const combinedRaw = { ...(S.btoPlanner ?? {}), ...(sharedRaw ?? {}) };
  return normalizeBtoPlannerPrefs(combinedRaw, {
    monthlySal: S.monthlySal,
    oa: S.oa,
  });
}

/**
 * Monthly OA contribution for self and partner per each person's chosen
 * growth mode — salary estimate, manual figure, or the latest logged
 * contribution (falling back to the manual figure when none is logged).
 */
export function resolveBtoOAMonthly(
  p: Pick<
    BtoPlannerPrefs,
    "tOaGrowthMode" | "pOaGrowthMode" | "tOAMonthly" | "pOAMonthly" | "tSal" | "pSal"
  >,
  fromContrib: { self: number | null; partner: number | null }
): { tOAMonthly: number; pOAMonthly: number } {
  const resolve = (
    mode: BtoOAGrowthMode,
    manual: number,
    contrib: number | null,
    sal: number
  ) =>
    mode === "manual" ? manual : mode === "contributions" ? (contrib ?? manual) : cpfOAmonthly(sal);
  return {
    tOAMonthly: resolve(p.tOaGrowthMode, p.tOAMonthly, fromContrib.self, p.tSal),
    pOAMonthly: resolve(p.pOaGrowthMode, p.pOAMonthly, fromContrib.partner, p.pSal),
  };
}

/**
 * Loan terms for computeBTO() from the loan chosen at key collection — the
 * HDB loan (planner rate/tenure, capped at the HLE amount) or a bank loan
 * (bank rate/tenure, capped at what current income allows under MAS rules,
 * with 5% of the price in cash).
 */
export function btoLoanTerms(
  p: Pick<
    BtoPlannerPrefs,
    "loanAtKeys" | "rate" | "tenure" | "maxLoanEligible" | "bankRate" | "bankTenure" | "tSal" | "pSal"
  >,
  opts: { otherDebtMonthly: number }
): {
  rate: number;
  tenure: number;
  maxLoanEligible: number;
  minCashPct: number;
  bank: BankLoanCapacity;
} {
  const bank = bankLoanCapacity({
    monthlyIncome: p.tSal + p.pSal,
    otherDebtMonthly: opts.otherDebtMonthly,
    tenureYears: p.bankTenure,
  });
  if (p.loanAtKeys === "bank") {
    return {
      rate: p.bankRate,
      tenure: bank.tenureYears,
      // computeBTO treats 0 as "no cap"; a household with no loan capacity still gets a $1 cap.
      maxLoanEligible: Math.max(1, bank.maxLoan),
      minCashPct: BANK_LOAN_RULES.minCashPct,
      bank,
    };
  }
  return {
    rate: p.rate,
    tenure: p.tenure,
    maxLoanEligible: p.maxLoanEligible,
    minCashPct: 0,
    bank,
  };
}

export function defaultBtoPlannerPrefs(opts: {
  monthlySal: number;
  oa: number;
  existing?: Partial<BtoPlannerPrefs>;
}): BtoPlannerPrefs {
  if (opts.existing) {
    return normalizeBtoPlannerPrefs(opts.existing, {
      monthlySal: opts.monthlySal,
      oa: opts.oa,
    });
  }
  const tSal = opts.monthlySal || 6500;
  const pSal = 4300;
  return {
    projectName: "Berlayar Rise",
    price: 580000,
    rate: 2.6,
    tenure: 25,
    yrsToKeys: 4,
    // Launched June 2026; flat booking (1st appointment) starts Nov 2026.
    applicationYm: "2026-06",
    // HDB requires signing the Agreement for Lease within 9 months of booking
    // an uncompleted flat — used as the estimate until an actual date is set.
    monthsToAFL: 9,
    optionFee: 2000,
    legalFee: 650,
    staggered: false,
    maxLoanEligible: 0,
    tSal,
    pSal,
    pOA: 14575,
    tOaGrowthMode: "salary",
    pOaGrowthMode: "salary",
    tOAMonthly: cpfOAmonthly(tSal),
    pOAMonthly: cpfOAmonthly(pSal),
    queueNumber: 0,
    queueTotal: 0,
    // Booking known to start Nov 2026; estimated TOP ~Sep 2031.
    bookingDateActual: "2026-11-01",
    aflDateActual: "",
    keysDateActual: "2031-09-01",
    // Latest possible key collection date per HDB.
    keysDateLatest: "2033-03-31",
    loanAtKeys: "hdb",
    bankRate: 2.8,
    bankTenure: 30,
    schemes: {
      ...defaultBTOSchemes(),
      ehg: { enabled: true, amountOverride: null },
    },
  };
}

/** "in 3 days" / "2 months ago" / "Today" style countdown label from a day delta. */
export function formatCountdown(days: number): string {
  if (days === 0) return "Today";
  const abs = Math.abs(days);
  if (abs < 60) {
    const unit = abs === 1 ? "day" : "days";
    return days > 0 ? `in ${abs} ${unit}` : `${abs} ${unit} ago`;
  }
  const months = Math.round(abs / 30.44);
  const unit = months === 1 ? "month" : "months";
  return days > 0 ? `in ~${months} ${unit}` : `~${months} ${unit} ago`;
}

export type BTOStageId = "application" | "booking" | "afl" | "keys" | "mortgage";
export type BTOStageStatus = "done" | "next" | "upcoming" | "active";

export type BTOStage = {
  id: BTOStageId;
  /** "YYYY-MM" estimate; "" for stages with no month-level estimate (application, mortgage). */
  estimatedYm: string;
  /** User-entered actual date ("YYYY-MM-DD"), or "" if not set. */
  actualDate: string;
  /** Resolved date used for countdown math: actualDate if set, else the 15th of estimatedYm. */
  dateYmd: string;
  isActual: boolean;
  daysUntil: number;
  status: BTOStageStatus;
};

type BTOMilestonePrefs = Pick<
  BtoPlannerPrefs,
  | "applicationYm"
  | "monthsToAFL"
  | "yrsToKeys"
  | "bookingDateActual"
  | "aflDateActual"
  | "keysDateActual"
>;

/**
 * Single source of truth for resolving each BTO milestone to a concrete date —
 * actual date if the user entered one, else an estimate. AFL is always
 * estimated relative to the resolved booking date (not the application month
 * directly), so overriding the booking date correctly shifts the AFL
 * estimate along with it. Shared by buildBTOStages (display) and
 * resolveBTOMonthOffsets (the CPF projection engine) so both agree on the
 * same dates.
 */
export function resolveBTOMilestoneDates(prefs: BTOMilestonePrefs) {
  const bookingEstYm = addMonthsYm(prefs.applicationYm, BOOKING_OFFSET_MONTHS);
  const bookingYmd = prefs.bookingDateActual || `${bookingEstYm}-15`;
  const aflEstYm = addMonthsYm(bookingYmd.slice(0, 7), prefs.monthsToAFL);
  const keysEstYm = addMonthsYm(prefs.applicationYm, Math.round(prefs.yrsToKeys * 12));

  const applicationYmd = `${prefs.applicationYm}-15`;
  const aflYmd = prefs.aflDateActual || `${aflEstYm}-15`;
  const keysYmd = prefs.keysDateActual || `${keysEstYm}-15`;

  return { applicationYmd, bookingEstYm, bookingYmd, aflEstYm, aflYmd, keysEstYm, keysYmd };
}

/**
 * Months from today to the resolved Booking, AFL, and key-collection dates —
 * used to time the CPF OA projection (and its milestone markers) in
 * computeBTO(). Computed from today (when the starting OA balance was
 * captured), not from the application month, and from the same
 * actual-or-estimated dates shown on the timeline, so the projection stays
 * consistent with what's displayed. Booking/AFL/KC are clamped to stay in
 * chronological order even if actual dates were entered inconsistently.
 */
export function resolveBTOMonthOffsets(
  prefs: BTOMilestonePrefs & { keysDateLatest?: string },
  todayYmd: string
): {
  bookingOffsetMonths: number;
  aflOffsetMonths: number;
  kcOffsetMonths: number;
  /** Months to HDB's latest key collection date; equals kcOffsetMonths when unset or earlier. */
  latestKcOffsetMonths: number;
} {
  const { bookingYmd, aflYmd, keysYmd } = resolveBTOMilestoneDates(prefs);
  const aflOffsetMonths = Math.max(0, Math.round(daysBetweenYmd(todayYmd, aflYmd) / 30.44));
  const kcOffsetMonthsRaw = Math.max(0, Math.round(daysBetweenYmd(todayYmd, keysYmd) / 30.44));
  const bookingOffsetMonthsRaw = Math.max(
    0,
    Math.round(daysBetweenYmd(todayYmd, bookingYmd) / 30.44)
  );
  const kcOffsetMonths = Math.max(aflOffsetMonths, kcOffsetMonthsRaw);
  const latestKcOffsetMonths = prefs.keysDateLatest
    ? Math.max(
        kcOffsetMonths,
        Math.round(daysBetweenYmd(todayYmd, prefs.keysDateLatest) / 30.44)
      )
    : kcOffsetMonths;
  return {
    bookingOffsetMonths: Math.min(bookingOffsetMonthsRaw, aflOffsetMonths),
    aflOffsetMonths,
    kcOffsetMonths,
    latestKcOffsetMonths,
  };
}

/**
 * Resolves the 5 BTO milestones (Application → Booking → AFL → Key collection →
 * Mortgage) against actual dates where the user has entered them, estimates
 * otherwise, and today's date — for the scrolling timeline's countdowns and
 * "which stage am I at" indicator.
 */
export function buildBTOStages(prefs: BTOMilestonePrefs, todayYmd: string): BTOStage[] {
  const { applicationYmd, bookingEstYm, bookingYmd, aflEstYm, aflYmd, keysEstYm, keysYmd } =
    resolveBTOMilestoneDates(prefs);

  // Application is always treated as already submitted; find the first of the
  // remaining three milestones that hasn't passed yet — that's the "next" one.
  const passed = [true, todayYmd >= bookingYmd, todayYmd >= aflYmd, todayYmd >= keysYmd];
  const nextIdx = passed.findIndex((done) => !done);
  const statusFor = (i: number): BTOStageStatus => {
    if (nextIdx === -1 || i < nextIdx) return "done";
    return i === nextIdx ? "next" : "upcoming";
  };

  return [
    {
      id: "application",
      estimatedYm: prefs.applicationYm,
      actualDate: "",
      dateYmd: applicationYmd,
      isActual: true,
      daysUntil: daysBetweenYmd(todayYmd, applicationYmd),
      status: "done",
    },
    {
      id: "booking",
      estimatedYm: bookingEstYm,
      actualDate: prefs.bookingDateActual,
      dateYmd: bookingYmd,
      isActual: Boolean(prefs.bookingDateActual),
      daysUntil: daysBetweenYmd(todayYmd, bookingYmd),
      status: statusFor(1),
    },
    {
      id: "afl",
      estimatedYm: aflEstYm,
      actualDate: prefs.aflDateActual,
      dateYmd: aflYmd,
      isActual: Boolean(prefs.aflDateActual),
      daysUntil: daysBetweenYmd(todayYmd, aflYmd),
      status: statusFor(2),
    },
    {
      id: "keys",
      estimatedYm: keysEstYm,
      actualDate: prefs.keysDateActual,
      dateYmd: keysYmd,
      isActual: Boolean(prefs.keysDateActual),
      daysUntil: daysBetweenYmd(todayYmd, keysYmd),
      status: statusFor(3),
    },
    {
      id: "mortgage",
      estimatedYm: "",
      actualDate: "",
      dateYmd: keysYmd,
      isActual: false,
      daysUntil: daysBetweenYmd(todayYmd, keysYmd),
      status: passed[3] ? "active" : "upcoming",
    },
  ];
}

export function calcBSD(price: number): number {
  let p = price;
  let t = 0;
  const br: [number, number][] = [
    [180000, 0.01],
    [180000, 0.02],
    [640000, 0.03],
    [500000, 0.04],
    [1500000, 0.05],
  ];
  for (const [cap, rate] of br) {
    if (p <= 0) break;
    const x = Math.min(p, cap);
    t += x * rate;
    p -= x;
  }
  return t;
}

export function computeBTO(inputs: BTOInputs) {
  const {
    price,
    rate,
    tenure,
    optionFee,
    legalFee,
    staggered,
    maxLoanEligible,
    schemes,
    tSal,
    pSal,
    pOA,
    tOA,
    tOAMonthly,
    pOAMonthly,
  } = inputs;
  const rateFrac = rate / 100;
  const oaMonthlyAt = inputs.oaMonthlyAt ?? (() => ({ t: tOAMonthly, p: pOAMonthly }));
  const totalGrants = totalHousingGrants(schemes, { tSal, pSal });
  // Informational only below (shown as "after grants") — grants don't reduce
  // the loan, BSD, or downpayment bills; see the CPF-credit note further down.
  const netPrice = Math.max(0, price - totalGrants);

  // Loan eligibility, BSD, and the downpayment percentages are all based on
  // the full purchase price — CPF housing grants don't reduce them. Loan is
  // capped at HDB's fixed 75% max LTV unless a bank/HDB-assessed max eligible
  // amount caps it lower.
  const maxHdbLoan = price * MAX_HDB_LTV;
  const loanCapped = maxLoanEligible > 0 && maxLoanEligible < maxHdbLoan;
  const loan = maxLoanEligible > 0 ? Math.min(maxHdbLoan, maxLoanEligible) : maxHdbLoan;

  // HDB's downpayment is a flat percentage of price — 5%/20% (AFL/KC) under
  // the Staggered Downpayment Scheme, 10%/15% otherwise — fixed regardless of
  // grants or whether the loan covers the full LTV. Any shortfall between
  // HDB's max loan (75% LTV) and a lower assessed max eligible loan is a
  // top-up that falls entirely on the key-collection payment, not spread
  // into AFL. Grants instead credit extra CPF OA funds (below) to help pay
  // these bills.
  const dpAFL = price * (staggered ? 0.05 : 0.1);
  const dpKCBase = price * (staggered ? 0.2 : 0.15);
  const loanShortfall = Math.max(0, maxHdbLoan - loan);
  const dpKC = dpKCBase + loanShortfall;
  const dpTotal = dpAFL + dpKC;

  const bsd = calcBSD(price);

  const n = tenure * 12;
  const r = rateFrac / 12;
  const mortgage =
    loan > 0 && r > 0
      ? (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
      : loan / n;

  // Months from today to each stage — resolved by the caller via
  // resolveBTOMonthOffsets() from the actual-or-estimated dates, so this
  // projection stays consistent with what the timeline displays. Clamped
  // defensively so the stages never land out of chronological order.
  const bookingOffset = Math.min(
    Math.max(0, inputs.bookingOffsetMonths),
    Math.max(0, inputs.aflOffsetMonths)
  );
  const aflOffset = Math.max(0, inputs.aflOffsetMonths);
  const kcOffset = Math.max(aflOffset, inputs.kcOffsetMonths);

  // The option fee paid in cash at booking is later offset against the
  // purchase price, crediting straight against the AFL downpayment due.
  const neededAFL = Math.max(0, dpAFL - optionFee) + bsd + legalFee;
  const neededKC = dpKC;

  // CPF housing grants are credited into CPF OA as extra funds to help pay
  // the (grant-independent) downpayment bills above — split between self and
  // partner in proportion to their current OA balance.
  const grantShare = tOA + pOA > 0 ? tOA / (tOA + pOA) : 0.5;
  let to = tOA + totalGrants * grantShare;
  let po = pOA + totalGrants * (1 - grantShare);
  let pooled = to + po;
  const labels = ["Now"];
  const tSeries = [to];
  const pSeries = [po];
  // Parallel series: how much CPF is needed for the *next* upcoming payment
  // at each plotted point — starts at the AFL bill, steps down to the KC
  // bill right after AFL is paid, and to 0 once KC is paid too.
  const neededSeries = [neededAFL];
  // Month-by-month pooled OA (AFL drawn, KC *not* drawn) out to the latest
  // key collection date, with the bill due next — lets the price finder
  // show when OA catches up with the key-collection payment.
  const pooledSeries: { month: number; balance: number; due: number }[] = [
    { month: 0, balance: pooled, due: aflOffset > 0 ? neededAFL : neededKC },
  ];

  let cpfAvailAFL = pooled;
  let cpfUsedAFL = Math.min(neededAFL, cpfAvailAFL);
  let cashAFL = neededAFL - cpfUsedAFL;
  let balAfterAFL = cpfAvailAFL - cpfUsedAFL;
  // Cash the key-collection payment must include to meet minCashDownpayment —
  // depends on the AFL cash, so only final once AFL is paid.
  const mandatoryCashAtKC = () =>
    Math.max(0, Math.min(neededKC, price * (inputs.minCashPct ?? 0) - optionFee - cashAFL));
  let cpfAvailKC = pooled;
  let cpfUsedKC = 0;
  let cashKC = neededKC;
  let balAfterKC = pooled;

  // CPF-first, cash-fills-the-remainder waterfall at each payment stage —
  // amounts drawn from a pooled (self + partner) OA balance that keeps
  // compounding between stages. The individual to/po series are split
  // proportionally to each person's share at the moment of each payment, so
  // the chart's stacked bars actually step down at Booking (marker only —
  // cash, no OA drawdown), AFL, and Key Collection instead of showing an
  // uninterrupted accumulation curve that never reflects money leaving.
  for (let m = 1; m <= kcOffset; m++) {
    const inflowAt = oaMonthlyAt(m);
    to = (to + inflowAt.t) * (1 + 0.025 / 12);
    po = (po + inflowAt.p) * (1 + 0.025 / 12);
    pooled = (pooled + inflowAt.t + inflowAt.p) * (1 + 0.025 / 12);
    let milestoneHit = false;

    if (bookingOffset > 0 && m === bookingOffset) {
      labels.push("Booking");
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(neededAFL);
      milestoneHit = true;
    }

    if (m === aflOffset) {
      cpfAvailAFL = pooled;
      cpfUsedAFL = Math.min(neededAFL, cpfAvailAFL);
      cashAFL = neededAFL - cpfUsedAFL;

      labels.push("AFL");
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(neededAFL);

      const totalBeforeAFL = to + po;
      const toShareAFL = totalBeforeAFL > 0 ? to / totalBeforeAFL : 0.5;
      to -= cpfUsedAFL * toShareAFL;
      po -= cpfUsedAFL * (1 - toShareAFL);
      pooled -= cpfUsedAFL;
      balAfterAFL = pooled;

      labels.push("AFL (paid)");
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(neededKC);
      milestoneHit = true;
    }

    if (m === kcOffset) {
      cpfAvailKC = pooled;
      cpfUsedKC = Math.min(neededKC - mandatoryCashAtKC(), cpfAvailKC);
      cashKC = neededKC - cpfUsedKC;

      labels.push("Key collection");
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(neededKC);

      const totalBeforeKC = to + po;
      const toShareKC = totalBeforeKC > 0 ? to / totalBeforeKC : 0.5;
      to -= cpfUsedKC * toShareKC;
      po -= cpfUsedKC * (1 - toShareKC);
      pooled -= cpfUsedKC;
      balAfterKC = pooled;

      labels.push("Key collection (paid)");
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(0);
      milestoneHit = true;
    }

    pooledSeries.push({
      month: m,
      balance: m === kcOffset ? cpfAvailKC : pooled,
      due: m < aflOffset ? neededAFL : neededKC,
    });

    if (!milestoneHit && m % 6 === 0) {
      labels.push("M" + m);
      tSeries.push(to);
      pSeries.push(po);
      neededSeries.push(neededSeries[neededSeries.length - 1]);
    }
  }

  // Latest key collection: if keys come as late as HDB allows, the KC bill is
  // paid later and the (post-AFL) pooled OA keeps compounding until then. Also
  // finds the first month the pooled OA catches up with the KC bill, if it
  // does by the latest date.
  const mandatoryCashKC = mandatoryCashAtKC();
  const cpfAllowedKC = neededKC - mandatoryCashKC;
  const latestKcOffset = Math.max(kcOffset, inputs.latestKcOffsetMonths ?? kcOffset);
  let cpfAvailLatestKC = cpfAvailKC;
  let kcCoveredOffset: number | null = cpfAvailLatestKC >= cpfAllowedKC ? kcOffset : null;
  for (let m = kcOffset + 1; m <= latestKcOffset; m++) {
    const inflowAt = oaMonthlyAt(m);
    cpfAvailLatestKC = (cpfAvailLatestKC + inflowAt.t + inflowAt.p) * (1 + 0.025 / 12);
    pooledSeries.push({ month: m, balance: cpfAvailLatestKC, due: neededKC });
    if (kcCoveredOffset == null && cpfAvailLatestKC >= cpfAllowedKC) kcCoveredOffset = m;
  }
  // "OK" = CPF covers everything it's allowed to; any mandatory cash is expected.
  const cashLatestKC = neededKC - Math.min(cpfAllowedKC, cpfAvailLatestKC);
  const latestKcOK = cpfAvailLatestKC >= cpfAllowedKC;

  const totalCash = optionFee + cashAFL + cashKC;
  const totalCpf = cpfUsedAFL + cpfUsedKC;
  const oaInflow = tOAMonthly + pOAMonthly;
  const mortSurplus = oaInflow - mortgage;
  const mortOK = mortSurplus >= 0;
  const dpOK = cashKC <= mandatoryCashKC;

  let verdict = "";
  if (dpOK && mortOK) {
    verdict = `Your goal of paying the flat fully through CPF looks achievable. Grants of ${fmt(totalGrants)} reduce the purchase price to ${fmt(netPrice)}. By key collection your pooled CPF OA covers the downpayment with ${fmt(balAfterKC)} to spare, and your combined monthly OA inflow (${fmt(oaInflow)}) exceeds the mortgage (${fmt(mortgage)}).`;
  } else if (dpOK && !mortOK) {
    verdict = `The downpayment is covered by CPF, but the monthly mortgage (${fmt(mortgage)}) is ${fmt(-mortSurplus)}/mo above your combined OA inflow.`;
  } else if (!dpOK && mortOK) {
    verdict = `The mortgage is CPF-serviceable, but the downpayment falls ${fmt(cashKC)} short of projected pooled OA at key collection — that much would need to come from cash.`;
  } else {
    verdict =
      "Both the downpayment and the monthly mortgage currently exceed CPF capacity. Consider a lower flat price, a longer loan tenure, or building cash savings.";
  }

  return {
    price,
    netPrice,
    totalGrants,
    loan,
    loanCapped,
    dpTotal,
    dpAFL,
    dpKC,
    dpKCBase,
    loanShortfall,
    neededAFL,
    neededKC,
    bsd,
    optionFee,
    legalFee,
    mortgage,
    labels,
    tSeries,
    pSeries,
    neededSeries,
    pooledSeries,
    to,
    po,
    cpfAvailAFL,
    cpfUsedAFL,
    cashAFL,
    balAfterAFL,
    cpfAvailKC,
    cpfUsedKC,
    cashKC,
    balAfterKC,
    mandatoryCashKC,
    latestKcOffset,
    cpfAvailLatestKC,
    cashLatestKC,
    latestKcOK,
    kcCoveredOffset,
    totalCash,
    totalCpf,
    oaInflow,
    mortSurplus,
    mortOK,
    dpOK,
    extras: bsd + legalFee + optionFee,
    verdict,
  };
}
