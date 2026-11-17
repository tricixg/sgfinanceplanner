/**
 * CPF contribution and allocation rates by age.
 *
 * Source: CPF Board "CPF Allocation Rates from 1 January 2026" and the 2026
 * contribution-rate tables, private-sector / non-pensionable employees,
 * ordinary wages above $750/month. Re-check against cpf.gov.sg each January.
 *
 * Modelling limits (also shown to the user on the Year and CPF pages):
 *  - Ages above 65 use the 60–65 row (not separately modelled).
 *  - From 1 Jan 2027 the 55–65 total rates rise (CPF Board); that step is not
 *    modelled, the 2026 rates are used for every projected year.
 *  - Members 55+ have no Special Account: the `sa` bucket stands for their
 *    Retirement Account. The Full Retirement Sum cap on RA credits, and wages
 *    below $750 / additional wages (bonuses), are not modelled.
 */
export const CPF_EMP = 0.2;
export const CPF_ER = 0.17;
export const OW_CEIL = 8000;

export type CpfAllocation = { oa: number; sa: number; ma: number };

export type CpfRateBand = {
  /** Band applies while the CPF age is <= maxAge (CPF's "above X to Y" bands). */
  maxAge: number;
  label: string;
  /** Employee share of ordinary wages. */
  employee: number;
  /** Employer share of ordinary wages. */
  employer: number;
  /** Share of the total contribution credited to each account. */
  allocation: CpfAllocation;
};

export const CPF_RATE_BANDS: readonly CpfRateBand[] = [
  { maxAge: 35, label: "35 and below", employee: 0.2, employer: 0.17, allocation: { oa: 0.6217, sa: 0.1621, ma: 0.2162 } },
  { maxAge: 45, label: "Above 35 to 45", employee: 0.2, employer: 0.17, allocation: { oa: 0.5677, sa: 0.1891, ma: 0.2432 } },
  { maxAge: 50, label: "Above 45 to 50", employee: 0.2, employer: 0.17, allocation: { oa: 0.5136, sa: 0.2162, ma: 0.2702 } },
  { maxAge: 55, label: "Above 50 to 55", employee: 0.2, employer: 0.17, allocation: { oa: 0.4055, sa: 0.3108, ma: 0.2837 } },
  { maxAge: 60, label: "Above 55 to 60", employee: 0.18, employer: 0.16, allocation: { oa: 0.353, sa: 0.3382, ma: 0.3088 } },
  { maxAge: 65, label: "Above 60 to 65", employee: 0.125, employer: 0.125, allocation: { oa: 0.14, sa: 0.44, ma: 0.42 } },
];

/** Oldest band modelled; older members use it too. */
export const CPF_MAX_MODELLED_AGE = 65;

// ≤35 allocation, kept for the BTO planner and existing callers.
export const ALLOC_OA = CPF_RATE_BANDS[0].allocation.oa;
export const ALLOC_SA = CPF_RATE_BANDS[0].allocation.sa;
export const ALLOC_MA = CPF_RATE_BANDS[0].allocation.ma;

/** Band for a CPF age. `null`/unknown age → the ≤35 band (the behaviour before DOB existed). */
export function cpfBandForAge(age: number | null | undefined): CpfRateBand {
  if (age == null || !Number.isFinite(age)) return CPF_RATE_BANDS[0];
  return (
    CPF_RATE_BANDS.find((b) => age <= b.maxAge) ??
    CPF_RATE_BANDS[CPF_RATE_BANDS.length - 1]
  );
}

/**
 * Age used for CPF rates in month `ym` (YYYY-MM): the age on the last day of
 * the previous month, so a new band starts the month AFTER the birthday month
 * (CPF applies age-based rate changes from the following month). Returns null
 * without a valid date of birth.
 */
export function cpfAgeForMonth(
  dateOfBirth: string | null | undefined,
  ym: string
): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [by, bm, bd] = dateOfBirth.split("-").map(Number);
  const [y, m] = ym.split("-").map(Number);
  if (![by, bm, bd, y, m].every(Number.isFinite)) return null;
  // last day of the previous month = day 0 of this month (UTC-safe, no local TZ)
  const refY = m === 1 ? y - 1 : y;
  const refM = m === 1 ? 12 : m - 1;
  const refD = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  let age = refY - by;
  if (refM < bm || (refM === bm && refD < bd)) age -= 1;
  return age < 0 ? null : age;
}

export function cpfTotal(w: number, age?: number | null): number {
  const b = cpfBandForAge(age);
  return Math.min(w, OW_CEIL) * (b.employee + b.employer);
}

export function cpfEmp(w: number, age?: number | null): number {
  return Math.min(w, OW_CEIL) * cpfBandForAge(age).employee;
}

/** Amounts credited to OA / SA(RA) / MA for a month's total contribution at this age. */
export function cpfAllocate(w: number, age?: number | null): CpfAllocation {
  const tot = cpfTotal(w, age);
  const a = cpfBandForAge(age).allocation;
  return { oa: tot * a.oa, sa: tot * a.sa, ma: tot * a.ma };
}

export function cpfOAmonthly(sal: number, age?: number | null): number {
  return cpfAllocate(sal, age).oa;
}
