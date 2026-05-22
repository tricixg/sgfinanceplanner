import type { BtoPlannerPrefs } from "@/lib/types";
import { addMonthsYm } from "./calendar";
import { cpfOAmonthly } from "./cpf";
import {
  defaultBTOSchemes,
  totalHousingGrants,
  type BTOSchemeSelection,
} from "./bto-schemes";
import { currentYm, fmt, formatMonthLabel } from "./helpers";

export type BTOInputs = {
  price: number;
  ltv: number;
  rate: number;
  tenure: number;
  yrsToKeys: number;
  schemes: BTOSchemeSelection;
  tSal: number;
  pSal: number;
  pOA: number;
  tOA: number;
};

export { defaultBTOSchemes, BTO_SCHEME_DEFS } from "./bto-schemes";

export function defaultBtoPlannerPrefs(opts: {
  monthlySal: number;
  oa: number;
  existing?: BtoPlannerPrefs;
}): BtoPlannerPrefs {
  if (opts.existing) return opts.existing;
  return {
    price: 580000,
    ltv: 75,
    rate: 2.6,
    tenure: 25,
    yrsToKeys: 4,
    applicationYm: currentYm(),
    tSal: opts.monthlySal || 6500,
    pSal: 4300,
    pOA: 14575,
    schemes: {
      ...defaultBTOSchemes(),
      ehg: { enabled: true, amountOverride: null },
      family: { enabled: true, amountOverride: null },
      step_up: { enabled: true, amountOverride: null },
    },
  };
}

/** Payment timeline labels from BTO application month and years to keys. */
export function buildBTOTimeline(applicationYm: string, yrsToKeys: number) {
  const bookingYm = addMonthsYm(applicationYm, 4);
  const keysYm = addMonthsYm(applicationYm, Math.round(yrsToKeys * 12));
  return {
    application: formatMonthLabel(applicationYm),
    booking: `~${formatMonthLabel(bookingYm)}`,
    keys: `~${formatMonthLabel(keysYm)}`,
  };
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
  const { price, ltv, rate, tenure, yrsToKeys, schemes, tSal, pSal, pOA, tOA } =
    inputs;
  const ltvFrac = ltv / 100;
  const rateFrac = rate / 100;
  const totalGrants = totalHousingGrants(schemes, { tSal, pSal });
  const netPrice = Math.max(0, price - totalGrants);
  const loan = netPrice * ltvFrac;
  const dpTotal = netPrice * (1 - ltvFrac);
  const afl = netPrice * 0.025;
  const keyPay = dpTotal - afl;

  const n = tenure * 12;
  const r = rateFrac / 12;
  const mortgage =
    loan > 0 && r > 0
      ? (loan * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1)
      : loan / n;

  const months = Math.round(yrsToKeys * 12);
  let to = tOA;
  let po = pOA;
  const labels = ["Now"];
  const tSeries = [to];
  const pSeries = [po];

  for (let m = 1; m <= months; m++) {
    to = to * (1 + 0.025 / 12) + cpfOAmonthly(tSal);
    po = po * (1 + 0.025 / 12) + cpfOAmonthly(pSal);
    if (m % 6 === 0 || m === months) {
      labels.push("M" + m);
      tSeries.push(to);
      pSeries.push(po);
    }
  }

  const combinedOA = to + po;
  const dpAvail = combinedOA;
  const dpSurplus = dpAvail - keyPay;
  const oaInflow = cpfOAmonthly(tSal) + cpfOAmonthly(pSal);
  const mortSurplus = oaInflow - mortgage;
  const bsd = calcBSD(netPrice);

  let verdict = "";
  const dpOK = dpSurplus >= 0;
  const mortOK = mortSurplus >= 0;
  if (dpOK && mortOK) {
    verdict = `Your goal of paying the flat fully through CPF looks achievable. Grants of ${fmt(totalGrants)} reduce the purchase price to ${fmt(netPrice)}. By key collection your combined OA (~${fmt(combinedOA)}) covers the 22.5% downpayment (${fmt(keyPay)}) with ${fmt(dpSurplus)} to spare, and your combined monthly OA inflow (${fmt(oaInflow)}) exceeds the mortgage (${fmt(mortgage)}).`;
  } else if (dpOK && !mortOK) {
    verdict = `The downpayment is covered by CPF, but the monthly mortgage (${fmt(mortgage)}) is ${fmt(-mortSurplus)}/mo above your combined OA inflow.`;
  } else if (!dpOK && mortOK) {
    verdict = `The mortgage is CPF-serviceable, but the 22.5% downpayment falls ${fmt(-dpSurplus)} short of projected OA.`;
  } else {
    verdict =
      "Both the downpayment and the monthly mortgage currently exceed CPF capacity. Consider a lower flat price, a longer loan tenure, or building cash savings.";
  }

  return {
    price,
    netPrice,
    totalGrants,
    loan,
    afl,
    keyPay,
    mortgage,
    labels,
    tSeries,
    pSeries,
    combinedOA,
    to,
    po,
    dpAvail,
    dpSurplus,
    oaInflow,
    mortSurplus,
    bsd,
    extras: bsd + 1500 + 2000,
    verdict,
    dpOK,
    mortOK,
  };
}
