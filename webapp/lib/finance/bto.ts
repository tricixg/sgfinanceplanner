import { cpfOAmonthly } from "./cpf";
import { fmt } from "./helpers";

export type BTOInputs = {
  price: number;
  ltv: number;
  rate: number;
  tenure: number;
  yrsToKeys: number;
  ehg: number;
  tSal: number;
  pSal: number;
  pOA: number;
  tOA: number;
};

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
  const { price, ltv, rate, tenure, yrsToKeys, ehg, tSal, pSal, pOA, tOA } =
    inputs;
  const ltvFrac = ltv / 100;
  const rateFrac = rate / 100;
  const loan = price * ltvFrac;
  const dpTotal = price * (1 - ltvFrac);
  const afl = price * 0.025;
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
  const dpAvail = combinedOA + ehg;
  const dpSurplus = dpAvail - keyPay;
  const oaInflow = cpfOAmonthly(tSal) + cpfOAmonthly(pSal);
  const mortSurplus = oaInflow - mortgage;
  const bsd = calcBSD(price);

  let verdict = "";
  const dpOK = dpSurplus >= 0;
  const mortOK = mortSurplus >= 0;
  if (dpOK && mortOK) {
    verdict = `Your goal of paying the flat fully through CPF looks achievable. By key collection your combined OA (~${fmt(combinedOA)}) covers the 22.5% downpayment (${fmt(keyPay)}) with ${fmt(dpSurplus)} to spare, and your combined monthly OA inflow (${fmt(oaInflow)}) exceeds the mortgage (${fmt(mortgage)}).`;
  } else if (dpOK && !mortOK) {
    verdict = `The downpayment is covered by CPF, but the monthly mortgage (${fmt(mortgage)}) is ${fmt(-mortSurplus)}/mo above your combined OA inflow.`;
  } else if (!dpOK && mortOK) {
    verdict = `The mortgage is CPF-serviceable, but the 22.5% downpayment falls ${fmt(-dpSurplus)} short of projected OA.`;
  } else {
    verdict =
      "Both the downpayment and the monthly mortgage currently exceed CPF capacity. Consider a lower flat price, a longer loan tenure, or building cash savings.";
  }

  return {
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
