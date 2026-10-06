import { addMonthsYmd } from "@/lib/cards/statement-cycle";
import type { BenefitClaim, PastCyclePeriod } from "@/lib/benefits/types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function byClaimedAtDesc(a: BenefitClaim, b: BenefitClaim): number {
  return a.claimedAt < b.claimedAt ? 1 : a.claimedAt > b.claimedAt ? -1 : 0;
}

function buildPeriod(bucket: BenefitClaim[], start: string, end: string): PastCyclePeriod {
  return {
    cycleStart: start,
    cycleEnd: end,
    usedInCycle: round2(bucket.reduce((sum, c) => sum + c.amount, 0)),
    claims: [...bucket].sort(byClaimedAtDesc),
  };
}

/**
 * Past cycle periods for a recurring benefit that have at least one claim,
 * most-recent-first. `currentCycleStart` is the start of the cycle containing
 * today (from `currentCycleWindow`) — everything before that is "past".
 *
 * Claims dated before `cycleAnchorDate` predate any regular cycle window
 * (e.g. the anchor was edited forward after claims were already logged —
 * it's freely editable). Rather than silently dropping them, they're
 * surfaced as one "pre-anchor" bucket.
 */
export function pastCycleUsage(
  cycleAnchorDate: string,
  cycleMonths: number | null,
  claims: BenefitClaim[],
  currentCycleStart: string
): PastCyclePeriod[] {
  if (!cycleMonths || cycleMonths <= 0 || claims.length === 0) return [];

  let earliest = claims[0].claimedAt;
  for (const c of claims) if (c.claimedAt < earliest) earliest = c.claimedAt;
  if (earliest >= currentCycleStart) return [];

  const periods: PastCyclePeriod[] = [];

  const orphans = claims.filter((c) => c.claimedAt < cycleAnchorDate);
  if (orphans.length) {
    periods.push(buildPeriod(orphans, earliest, cycleAnchorDate));
  }

  let start = cycleAnchorDate;
  let end = addMonthsYmd(start, cycleMonths);
  while (start < currentCycleStart) {
    const bucket = claims.filter((c) => c.claimedAt >= start && c.claimedAt < end);
    if (bucket.length) periods.push(buildPeriod(bucket, start, end));
    start = end;
    end = addMonthsYmd(start, cycleMonths);
  }

  return periods.reverse();
}
