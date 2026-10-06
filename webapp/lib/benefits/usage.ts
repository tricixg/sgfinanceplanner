import { currentCycleWindow } from "@/lib/benefits/cycle";
import { pastCycleUsage } from "@/lib/benefits/history";
import type { Benefit, BenefitClaim, BenefitUsage } from "@/lib/benefits/types";

const AMOUNT_EPS = 0.001;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function byClaimedAtDesc(a: BenefitClaim, b: BenefitClaim): number {
  return a.claimedAt < b.claimedAt ? 1 : a.claimedAt > b.claimedAt ? -1 : 0;
}

export function computeBenefitUsage(
  benefit: Benefit,
  claims: BenefitClaim[],
  todayYmd: string
): BenefitUsage {
  const { start, end } = currentCycleWindow(
    benefit.cycleAnchorDate,
    benefit.cycleMonths,
    todayYmd
  );

  let usedInCycle = 0;
  let totalClaimed = 0;
  const currentCycleClaims: BenefitClaim[] = [];
  for (const claim of claims) {
    totalClaimed += claim.amount;
    const inWindow = claim.claimedAt >= start && (end === null || claim.claimedAt < end);
    if (inWindow) {
      usedInCycle += claim.amount;
      currentCycleClaims.push(claim);
    }
  }
  usedInCycle = round2(usedInCycle);
  totalClaimed = round2(totalClaimed);
  currentCycleClaims.sort(byClaimedAtDesc);

  let remaining: number | null = null;
  if (benefit.limitAmount != null) {
    const remainingRaw = round2(benefit.limitAmount - usedInCycle);
    remaining = Math.abs(remainingRaw) <= AMOUNT_EPS ? 0 : remainingRaw;
  }

  const pastCycles = pastCycleUsage(benefit.cycleAnchorDate, benefit.cycleMonths, claims, start);

  return {
    ...benefit,
    cycleStart: start,
    cycleEnd: end,
    usedInCycle,
    remaining,
    totalClaimed,
    currentCycleClaims,
    pastCycles,
  };
}
