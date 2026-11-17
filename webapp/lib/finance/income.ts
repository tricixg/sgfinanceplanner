import type { DashboardState } from "@/lib/types";
import { cpfAgeForMonth, cpfEmp } from "./cpf";
import { currentYm } from "./helpers";
import { resolveMonthSalary } from "@/lib/budget/monthly";

/** Comms is tracked as an irregular benefit claim now, not guaranteed baseline pay. */
export function stableTakeHome(S: DashboardState): number {
  return S.monthlySal - cpfEmp(S.monthlySal, cpfAgeForMonth(S.dateOfBirth, currentYm()));
}

/** Gross salary that applied to `ym`: the month's recorded snapshot, else the profile salary. */
export function salaryForMonth(S: DashboardState, ym?: string): number {
  if (!ym || !S.incomeMonths) return S.monthlySal;
  return resolveMonthSalary(S.incomeMonths, ym)?.salary ?? S.monthlySal;
}

export function takeHomeForMonth(S: DashboardState, ym?: string): number {
  const sal = salaryForMonth(S, ym);
  return sal - cpfEmp(sal, cpfAgeForMonth(S.dateOfBirth, ym ?? currentYm()));
}
