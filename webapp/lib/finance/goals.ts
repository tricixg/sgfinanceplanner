import type { DashboardState, Goal } from "@/lib/types";
import type { SavingsGoal } from "@/lib/savings/types";
import { currentYm, monIdx } from "./helpers";

export function goalsFromSavingsGoals(goals: SavingsGoal[]): Goal[] {
  return goals.map((g) => ({
    name: g.name,
    target: g.targetAmount,
    saved: g.savedAmount,
    by: g.targetDate?.slice(0, 7) ?? "",
    where: g.whereLabel,
  }));
}

export function monthsUntil(ym: string, nowYm?: string): number {
  const now = monIdx(nowYm ?? currentYm());
  return Math.max(1, monIdx(ym) - now);
}

/** Monthly amount needed to reach target by date; null when no target date.
 *  When startDate is set, the period startDate→targetDate defines the monthly plan
 *  (useful for pre-planning a future saving window). */
export function monthlySavingNeeded(
  goal: Pick<SavingsGoal, "targetAmount" | "savedAmount" | "startDate" | "targetDate">,
  nowYm?: string
): number | null {
  if (!goal.targetDate) return null;
  const gap = Math.max(0, goal.targetAmount - goal.savedAmount);
  if (gap <= 0) return 0;
  const fromYm = goal.startDate?.slice(0, 7) ?? (nowYm ?? currentYm());
  const mths = Math.max(1, monIdx(goal.targetDate.slice(0, 7)) - monIdx(fromYm));
  return gap / mths;
}

export function goalsSummary(S: DashboardState, nowYm?: string) {
  let totT = 0;
  let totS = 0;
  let totMonthly = 0;
  const rows = S.goals.map((g) => {
    const gap = Math.max(0, g.target - g.saved);
    const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
    totT += g.target;
    totS += g.saved;
    if (!g.by) {
      return { ...g, gap, mths: 0, need: 0, pct };
    }
    const mths = monthsUntil(g.by, nowYm);
    const need = gap / mths;
    totMonthly += need;
    return { ...g, gap, mths, need, pct };
  });
  return { rows, totT, totS, totMonthly };
}
