import { addMonthsYm } from "./calendar";
import { computeBTO, type BTOInputs } from "./bto";
import { OW_CEIL, cpfOAmonthly } from "./cpf";

/**
 * Income goal for paying key collection fully from CPF OA (estimated date):
 * how much combined salary has to rise, with raises landing each January and
 * split equally (same % for both). Two shapes:
 * - yearly: the smallest steady % raise every January, compounding
 * - one raise: for each January before keys, the one-off raise needed if
 *   it's the only one, then held flat
 * Raises only add the extra CPF OA they generate on top of the planner's
 * current OA growth, and stop at the CPF salary ceiling (above it, pay adds
 * nothing to OA).
 */

export type BtoIncomeGoalYear = {
  year: number;
  /** Combined monthly salary that year. */
  income: number;
  /** Combined monthly OA contribution that year. */
  oaMonthly: number;
  /** Pooled OA at December, or at key collection in the keys year. */
  balance: number;
};

export type BtoIncomeGoal = {
  /** False when today's income already gets OA to the key-collection bill. */
  raiseNeeded: boolean;
  keysYear: number;
  yearly:
    | { reachable: true; growthPct: number; years: BtoIncomeGoalYear[] }
    | { reachable: false; maxedBalance: number };
  oneRaise: (
    | { year: number; reachable: true; income: number; raisePct: number; oaMonthly: number }
    | { year: number; reachable: false }
  )[];
  /** Some salary in the yearly goal reaches the CPF ceiling. */
  hitsSalaryCeiling: boolean;
};

const MAX_FACTOR = 100;
const ITERATIONS = 50;

/** Salary raised by `factor`, but never past the CPF ceiling (unless already above it). */
function raisedSalary(salary: number, factor: number): number {
  return Math.min(salary * factor, Math.max(salary, OW_CEIL));
}

export function btoIncomeGoal(inputs: BTOInputs, todayYm: string): BtoIncomeGoal {
  const startYear = Number(todayYm.slice(0, 4));
  const yearAt = (m: number) => Number(addMonthsYm(todayYm, m).slice(0, 4));
  const keysYear = yearAt(inputs.kcOffsetMonths);
  const { tSal, pSal } = inputs;

  /** Projection with salaries scaled by factorFor(yearIndex) from each January. */
  const project = (factorFor: (yearIndex: number) => number) => {
    const extraAt = (m: number) => {
      const f = factorFor(yearAt(m) - startYear);
      return {
        t: cpfOAmonthly(raisedSalary(tSal, f)) - cpfOAmonthly(tSal),
        p: cpfOAmonthly(raisedSalary(pSal, f)) - cpfOAmonthly(pSal),
      };
    };
    return computeBTO({
      ...inputs,
      oaMonthlyAt: (m) => {
        const extra = extraAt(m);
        return { t: inputs.tOAMonthly + extra.t, p: inputs.pOAMonthly + extra.p };
      },
    });
  };
  const covers = (b: ReturnType<typeof computeBTO>) => b.dpOK;

  /** Smallest factor in [1, MAX_FACTOR] for which `ok(factor)` holds, or null. */
  const solve = (ok: (factor: number) => boolean): number | null => {
    if (!ok(MAX_FACTOR)) return null;
    let lo = 1;
    let hi = MAX_FACTOR;
    for (let i = 0; i < ITERATIONS; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };

  const raiseNeeded = !covers(project(() => 1));
  const incomeFor = (f: number) => raisedSalary(tSal, f) + raisedSalary(pSal, f);
  const oaFor = (f: number) =>
    inputs.tOAMonthly +
    inputs.pOAMonthly +
    cpfOAmonthly(raisedSalary(tSal, f)) -
    cpfOAmonthly(tSal) +
    cpfOAmonthly(raisedSalary(pSal, f)) -
    cpfOAmonthly(pSal);

  // Yearly: factor (1 + g) per January, compounding.
  const growth = raiseNeeded
    ? solve((f) => covers(project((idx) => Math.pow(f, idx))))
    : 1;
  let yearly: BtoIncomeGoal["yearly"];
  let hitsSalaryCeiling = false;
  if (growth == null) {
    yearly = { reachable: false, maxedBalance: project((idx) => (idx > 0 ? MAX_FACTOR : 1)).cpfAvailKC };
  } else {
    const b = project((idx) => Math.pow(growth, idx));
    const years: BtoIncomeGoalYear[] = [];
    for (let year = startYear; year <= keysYear; year++) {
      const f = Math.pow(growth, year - startYear);
      // Last plotted month of that year (or key collection).
      const point = [...b.pooledSeries]
        .reverse()
        .find((s) => s.month <= inputs.kcOffsetMonths && yearAt(s.month) === year);
      years.push({
        year,
        income: incomeFor(f),
        oaMonthly: oaFor(f),
        balance: point?.balance ?? 0,
      });
      // The ceiling binds when the raise would have taken a salary past it.
      if (tSal * f > Math.max(tSal, OW_CEIL) || pSal * f > Math.max(pSal, OW_CEIL)) {
        hitsSalaryCeiling = true;
      }
    }
    yearly = { reachable: true, growthPct: (growth - 1) * 100, years };
  }

  // One raise from January of each year before keys, then held flat.
  const oneRaise: BtoIncomeGoal["oneRaise"] = [];
  if (raiseNeeded) {
    for (let year = startYear + 1; year <= keysYear; year++) {
      const idxFrom = year - startYear;
      const f = solve((factor) => covers(project((idx) => (idx >= idxFrom ? factor : 1))));
      if (f == null) {
        oneRaise.push({ year, reachable: false });
      } else {
        const income = incomeFor(f);
        oneRaise.push({
          year,
          reachable: true,
          income,
          raisePct: (income / (tSal + pSal) - 1) * 100,
          oaMonthly: oaFor(f),
        });
      }
    }
  }

  return { raiseNeeded, keysYear, yearly, oneRaise, hitsSalaryCeiling };
}
