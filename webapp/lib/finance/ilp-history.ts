import type { IlpPolicy, IlpValueSnapshot } from "@/lib/types";
import { monIdx } from "./helpers";
import { todayDateStr } from "./holdings";

export function estimatedPremiumsPaid(
  policy: IlpPolicy,
  asOfYm?: string
): number {
  if (!policy.policyStartYm || policy.monthlyPremium <= 0) return 0;
  const endIdx = asOfYm ? monIdx(asOfYm) : monIdx(todayDateStr().slice(0, 7));
  const startIdx = monIdx(policy.policyStartYm);
  const months = Math.max(0, endIdx - startIdx + 1);
  return months * policy.monthlyPremium;
}

/** Premiums paid minus one-off start bonus (floor at 0). */
export function estimatedNetPremiumsPaid(
  policy: IlpPolicy,
  asOfYm?: string
): number {
  const gross = estimatedPremiumsPaid(policy, asOfYm);
  const bonus = policy.initialBonus ?? 0;
  return Math.max(0, gross - bonus);
}

export function ilpProfit(policy: IlpPolicy, asOfYm?: string): number {
  return policy.accountValue - estimatedNetPremiumsPaid(policy, asOfYm);
}

export function recordIlpValueSnapshot(
  policy: IlpPolicy,
  newValue: number,
  recordedAt = todayDateStr()
): IlpPolicy {
  const history = [...(policy.valueHistory ?? [])];
  const last = history[history.length - 1];
  if (
    last &&
    last.recordedAt === recordedAt &&
    last.accountValue === newValue
  ) {
    return { ...policy, accountValue: newValue, valueHistory: history };
  }
  if (last && last.accountValue === newValue) {
    return { ...policy, accountValue: newValue, valueHistory: history };
  }
  history.push({ recordedAt, accountValue: newValue });
  console.log("[ilp-history] snapshot recorded", {
    plan: policy.planName,
    recordedAt,
    accountValue: newValue,
    points: history.length,
  });
  return { ...policy, accountValue: newValue, valueHistory: history };
}

export type IlpChartSeries = {
  labels: string[];
  values: number[];
  premiums: number[];
};

export function ilpChartSeries(policy: IlpPolicy): IlpChartSeries | null {
  const history = policy.valueHistory ?? [];
  if (history.length < 2) return null;

  const sorted = [...history].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt)
  );

  const labels: string[] = [];
  const values: number[] = [];
  const premiums: number[] = [];

  for (const snap of sorted) {
    labels.push(snap.recordedAt);
    values.push(snap.accountValue);
    const ym = snap.recordedAt.slice(0, 7);
    premiums.push(estimatedNetPremiumsPaid(policy, ym));
  }

  return { labels, values, premiums };
}

/** Ensure valueHistory exists; does not auto-add today's value. */
export function migrateIlpValueHistory(policy: IlpPolicy): IlpPolicy {
  return {
    ...policy,
    valueHistory: Array.isArray(policy.valueHistory) ? policy.valueHistory : [],
  };
}
