import type { NetWorthSnapshot } from "@/lib/types";
import type { SavingsGoal } from "@/lib/savings/types";

/**
 * Financial-health indicators. Pure functions; inputs come from data the app
 * already holds (accounts, loans, snapshots, analytics). Thresholds are common
 * rules of thumb used only to colour a status pill — they are not advice.
 */

export type HealthStatus = "good" | "watch" | "risk" | "neutral";

export const STATUS_LABEL: Record<HealthStatus, string> = {
  good: "Healthy",
  watch: "Watch",
  risk: "At risk",
  neutral: "No data",
};

/** Months of spending that liquid cash would cover; null without a spending baseline. */
export function runwayMonths(liquidCash: number, avgMonthlySpending: number): number | null {
  if (!(avgMonthlySpending > 0)) return null;
  return Math.max(0, liquidCash) / avgMonthlySpending;
}

/** 6+ months is the usual emergency-fund target; under 3 is thin. */
export function runwayStatus(months: number | null): HealthStatus {
  if (months == null) return "neutral";
  if (months >= 6) return "good";
  if (months >= 3) return "watch";
  return "risk";
}

/** A 20% savings rate is the common benchmark (50/30/20). */
export function savingsRateStatus(rate: number | null): HealthStatus {
  if (rate == null) return "neutral";
  if (rate >= 0.2) return "good";
  if (rate >= 0.1) return "watch";
  return "risk";
}

/** Share of income going to a monthly obligation; null without income. */
export function ratio(part: number, income: number): number | null {
  if (!(income > 0)) return null;
  return Math.max(0, part) / income;
}

/** Non-mortgage debt repayments: under 20% of take-home is comfortable, over 35% is heavy. */
export function debtServiceStatus(r: number | null): HealthStatus {
  if (r == null) return "neutral";
  if (r <= 0.2) return "good";
  if (r <= 0.35) return "watch";
  return "risk";
}

/** Fixed commitments (the "needs" bucket): about half of take-home or less leaves room to save. */
export function commitmentStatus(r: number | null): HealthStatus {
  if (r == null) return "neutral";
  if (r <= 0.5) return "good";
  if (r <= 0.7) return "watch";
  return "risk";
}

export type NetWorthPoint = { month: string; value: number };

/** Snapshot series as plottable points, oldest first, honouring the CPF toggle. */
export function netWorthSeries(
  history: NetWorthSnapshot[],
  includeCpf: boolean
): NetWorthPoint[] {
  return [...history]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => ({ month: s.month.slice(0, 7), value: s.lnw + (includeCpf ? s.cpf : 0) }));
}

export type NetWorthChange = {
  /** Month (YYYY-MM) of the snapshot compared against. */
  sinceYm: string;
  amount: number;
  pct: number | null;
};

/**
 * Change between the live figure and the latest snapshot at least `monthsBack`
 * months before `currentYm`. Null when no snapshot is old enough.
 */
export function netWorthChange(
  series: NetWorthPoint[],
  current: number,
  currentYm: string,
  monthsBack: number
): NetWorthChange | null {
  const [y, m] = currentYm.split("-").map(Number);
  const cutoffIdx = y! * 12 + (m! - 1) - monthsBack;
  const cutoffYm = `${Math.floor(cutoffIdx / 12)}-${String((cutoffIdx % 12) + 1).padStart(2, "0")}`;
  const candidates = series.filter((p) => p.month <= cutoffYm);
  const base = candidates[candidates.length - 1];
  if (!base) return null;
  const amount = current - base.value;
  return {
    sinceYm: base.month,
    amount,
    pct: base.value > 0 ? (amount / base.value) * 100 : null,
  };
}

export type GoalProgress = {
  id: string;
  name: string;
  saved: number;
  target: number;
  /** 0–1, capped. */
  progress: number;
  remaining: number;
  targetYm: string | null;
  monthsLeft: number | null;
  /** Monthly amount needed to reach the target on time; null without a future target date. */
  neededPerMonth: number | null;
  /** Planned monthly contribution covers what's needed (or the goal is done). */
  onTrack: boolean | null;
};

export function goalProgress(goal: SavingsGoal, currentYm: string): GoalProgress {
  const target = Math.max(0, goal.targetAmount);
  const saved = Math.max(0, goal.savedAmount);
  const remaining = Math.max(0, target - saved);
  const targetYm = goal.targetDate ? goal.targetDate.slice(0, 7) : null;
  let monthsLeft: number | null = null;
  if (targetYm) {
    const [ty, tm] = targetYm.split("-").map(Number);
    const [cy, cm] = currentYm.split("-").map(Number);
    monthsLeft = ty! * 12 + tm! - (cy! * 12 + cm!);
  }
  const done = target > 0 && remaining <= 0;
  const neededPerMonth =
    done ? 0 : monthsLeft != null && monthsLeft > 0 ? remaining / monthsLeft : null;
  let onTrack: boolean | null = null;
  if (done) onTrack = true;
  else if (monthsLeft != null && monthsLeft <= 0) onTrack = false;
  else if (neededPerMonth != null) onTrack = goal.monthlyContribution + 0.005 >= neededPerMonth;
  return {
    id: goal.id,
    name: goal.name,
    saved,
    target,
    progress: target > 0 ? Math.min(1, saved / target) : 0,
    remaining,
    targetYm,
    monthsLeft,
    neededPerMonth,
    onTrack,
  };
}
