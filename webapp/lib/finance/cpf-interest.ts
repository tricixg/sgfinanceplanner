/**
 * CPF interest, the way CPF Board pays it.
 *
 * What it calculates: interest for each month on the LOWEST balance held in
 * that calendar month (so money that arrives or leaves mid-month only counts
 * from the next month / not at all), added up through the year and CREDITED
 * ONCE, at the end of December. Interest is not compounded within the year.
 * A contribution made during month M therefore starts earning from month M+1.
 *
 * Base rates (2026): OA 2.5% p.a.; SA / MA / RA 4% p.a.
 * Extra interest (credited to SA, or RA at 55+): +1% on the first $60,000 of
 * combined balances, with at most $20,000 of OA counted. For members aged 55+,
 * a further +1% on the first $30,000 of those combined balances.
 *
 * Sources: CPF Board interest-rate pages / news (base rates and the $60k /
 * $20k rule). The 55+ extra $30k tier was only confirmed from third-party
 * guides — verify on cpf.gov.sg before relying on it. Rates are reviewed
 * quarterly by CPF Board; the 4% floor for SA/MA/RA is in place to end-2027.
 *
 * Not modelled: interest already earned earlier in the current year (it is
 * not in today's balance and is not estimated), the Full Retirement Sum cap,
 * and the CPF LIFE / RA transfer at 55.
 */
export const CPF_BASE_RATES = { oa: 0.025, sa: 0.04, ma: 0.04 } as const;

export const CPF_EXTRA_INTEREST = {
  rate: 0.01,
  /** Combined balances that earn the extra 1%. */
  combinedCap: 60_000,
  /** Most OA that counts towards the combined cap. */
  oaCap: 20_000,
  /** Members this age and above earn a further extra on a smaller slice. */
  seniorAge: 55,
  seniorRate: 0.01,
  seniorCap: 30_000,
} as const;

export type CpfBalances = { oa: number; sa: number; ma: number };

export const ZERO_BALANCES: CpfBalances = { oa: 0, sa: 0, ma: 0 };

/** Interest for ONE month on the lowest balances held in it. Extra interest lands in `sa`. */
export function monthlyCpfInterest(
  lowest: CpfBalances,
  age?: number | null
): CpfBalances {
  const oa = Math.max(0, lowest.oa);
  const sa = Math.max(0, lowest.sa);
  const ma = Math.max(0, lowest.ma);
  const x = CPF_EXTRA_INTEREST;
  const eligible = Math.min(oa, x.oaCap) + sa + ma;
  let extra = Math.min(eligible, x.combinedCap) * x.rate;
  if (age != null && age >= x.seniorAge) {
    extra += Math.min(eligible, x.seniorCap) * x.seniorRate;
  }
  return {
    oa: (oa * CPF_BASE_RATES.oa) / 12,
    sa: (sa * CPF_BASE_RATES.sa + extra) / 12,
    ma: (ma * CPF_BASE_RATES.ma) / 12,
  };
}

/** OA-only monthly interest (BTO planner): base OA rate, extra interest is credited to SA, not OA. */
export function monthlyOaInterest(lowestOa: number): number {
  return (Math.max(0, lowestOa) * CPF_BASE_RATES.oa) / 12;
}

export function addBalances(a: CpfBalances, b: CpfBalances): CpfBalances {
  return { oa: a.oa + b.oa, sa: a.sa + b.sa, ma: a.ma + b.ma };
}

/** CPF credits a year's interest on 31 December. `ym` is YYYY-MM. */
export function isInterestCreditMonth(ym: string): boolean {
  return ym.slice(5, 7) === "12";
}
