import type { BtoOAGrowthMode, BtoPlannerPrefs } from "@/lib/types";
import { addMonthsYm, daysBetweenYmd } from "./calendar";
import { cpfOAmonthly } from "./cpf";
import {
  BTO_SCHEME_DEFS,
  defaultBTOSchemes,
  totalHousingGrants,
  type BTOSchemeSelection,
} from "./bto-schemes";
import { currentYm, fmt, formatMonthLabel } from "./helpers";

/** Months from BTO application to the booking (1st) appointment. */
const BOOKING_OFFSET_MONTHS = 4;

export type BTOInputs = {
  price: number;
  ltv: number;
  rate: number;
  tenure: number;
  yrsToKeys: number;
  monthsToAFL: number;
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
    price: typeof raw.price === "number" ? raw.price : base.price,
    ltv: typeof raw.ltv === "number" ? raw.ltv : base.ltv,
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
    schemes: normalizeBTOSchemes(raw.schemes),
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
    price: 580000,
    ltv: 75,
    rate: 2.6,
    tenure: 25,
    yrsToKeys: 4,
    applicationYm: currentYm(),
    monthsToAFL: 5,
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
    bookingDateActual: "",
    aflDateActual: "",
    keysDateActual: "",
    schemes: {
      ...defaultBTOSchemes(),
      ehg: { enabled: true, amountOverride: null },
    },
  };
}

/** Payment timeline labels from BTO application month, months to AFL, and years to keys. */
export function buildBTOTimeline(
  applicationYm: string,
  monthsToAFL: number,
  yrsToKeys: number
) {
  const bookingYm = addMonthsYm(applicationYm, BOOKING_OFFSET_MONTHS);
  const aflYm = addMonthsYm(applicationYm, BOOKING_OFFSET_MONTHS + monthsToAFL);
  const keysYm = addMonthsYm(applicationYm, Math.round(yrsToKeys * 12));
  return {
    application: formatMonthLabel(applicationYm),
    booking: `~${formatMonthLabel(bookingYm)}`,
    afl: `~${formatMonthLabel(aflYm)}`,
    keys: `~${formatMonthLabel(keysYm)}`,
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

/**
 * Resolves the 5 BTO milestones (Application → Booking → AFL → Key collection →
 * Mortgage) against actual dates where the user has entered them, estimates
 * otherwise, and today's date — for the scrolling timeline's countdowns and
 * "which stage am I at" indicator.
 */
export function buildBTOStages(
  prefs: Pick<
    BtoPlannerPrefs,
    | "applicationYm"
    | "monthsToAFL"
    | "yrsToKeys"
    | "bookingDateActual"
    | "aflDateActual"
    | "keysDateActual"
  >,
  todayYmd: string
): BTOStage[] {
  const bookingEstYm = addMonthsYm(prefs.applicationYm, BOOKING_OFFSET_MONTHS);
  const aflEstYm = addMonthsYm(prefs.applicationYm, BOOKING_OFFSET_MONTHS + prefs.monthsToAFL);
  const keysEstYm = addMonthsYm(prefs.applicationYm, Math.round(prefs.yrsToKeys * 12));

  const applicationYmd = `${prefs.applicationYm}-15`;
  const bookingYmd = prefs.bookingDateActual || `${bookingEstYm}-15`;
  const aflYmd = prefs.aflDateActual || `${aflEstYm}-15`;
  const keysYmd = prefs.keysDateActual || `${keysEstYm}-15`;

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
    ltv,
    rate,
    tenure,
    yrsToKeys,
    monthsToAFL,
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
  const ltvFrac = ltv / 100;
  const rateFrac = rate / 100;
  const totalGrants = totalHousingGrants(schemes, { tSal, pSal });
  const netPrice = Math.max(0, price - totalGrants);

  // Loan is LTV-derived unless a bank/HDB-assessed max eligible amount caps it lower;
  // the downpayment always absorbs whatever the loan doesn't cover.
  const ltvLoan = netPrice * ltvFrac;
  const loanCapped = maxLoanEligible > 0 && maxLoanEligible < ltvLoan;
  const loan = maxLoanEligible > 0 ? Math.min(ltvLoan, maxLoanEligible) : ltvLoan;
  const dpTotal = Math.max(0, netPrice - loan);

  // Staggered Downpayment Scheme: 5% @ AFL / 20% @ keys instead of 10% / 15%
  // (both expressed as a share of the total downpayment, so they hold even
  // when the loan — and hence dpTotal — is eligibility-capped).
  const aflShare = staggered ? 0.2 : 0.4;
  const keyShare = staggered ? 0.8 : 0.6;
  const dpAFL = dpTotal * aflShare;
  const dpKC = dpTotal * keyShare;

  const bsd = calcBSD(netPrice);

  const n = tenure * 12;
  const r = rateFrac / 12;
  const mortgage =
    loan > 0 && r > 0
      ? (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
      : loan / n;

  const bookingOffset = BOOKING_OFFSET_MONTHS;
  const aflOffset = bookingOffset + monthsToAFL;
  const kcOffset = Math.max(aflOffset, Math.round(yrsToKeys * 12));

  const neededAFL = dpAFL + bsd + legalFee;
  const neededKC = dpKC;

  let to = tOA;
  let po = pOA;
  let pooled = tOA + pOA;
  const labels = ["Now"];
  const tSeries = [to];
  const pSeries = [po];

  let cpfAvailAFL = pooled;
  let cpfUsedAFL = Math.min(neededAFL, cpfAvailAFL);
  let cashAFL = neededAFL - cpfUsedAFL;
  let balAfterAFL = cpfAvailAFL - cpfUsedAFL;
  let cpfAvailKC = pooled;
  let cpfUsedKC = 0;
  let cashKC = neededKC;
  let balAfterKC = pooled;

  // CPF-first, cash-fills-the-remainder waterfall at each payment stage —
  // amounts drawn from a pooled (self + partner) OA balance that keeps
  // compounding between stages; the individual to/po series below are an
  // uninterrupted accumulation curve (informational, for the chart) and are
  // not drawn down by payments.
  for (let m = 1; m <= kcOffset; m++) {
    to = (to + tOAMonthly) * (1 + 0.025 / 12);
    po = (po + pOAMonthly) * (1 + 0.025 / 12);
    pooled = (pooled + tOAMonthly + pOAMonthly) * (1 + 0.025 / 12);

    if (m === aflOffset) {
      cpfAvailAFL = pooled;
      cpfUsedAFL = Math.min(neededAFL, cpfAvailAFL);
      cashAFL = neededAFL - cpfUsedAFL;
      pooled -= cpfUsedAFL;
      balAfterAFL = pooled;
    }
    if (m === kcOffset) {
      cpfAvailKC = pooled;
      cpfUsedKC = Math.min(neededKC, cpfAvailKC);
      cashKC = neededKC - cpfUsedKC;
      pooled -= cpfUsedKC;
      balAfterKC = pooled;
    }
    if (m % 6 === 0 || m === kcOffset) {
      labels.push("M" + m);
      tSeries.push(to);
      pSeries.push(po);
    }
  }

  const totalCash = optionFee + cashAFL + cashKC;
  const totalCpf = cpfUsedAFL + cpfUsedKC;
  const oaInflow = tOAMonthly + pOAMonthly;
  const mortSurplus = oaInflow - mortgage;
  const mortOK = mortSurplus >= 0;
  const dpOK = cashKC <= 0;

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
    bsd,
    optionFee,
    legalFee,
    mortgage,
    labels,
    tSeries,
    pSeries,
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
