import { roundMoney } from "@/lib/cards/interest-accrual";
import type { OpenCycleEstimate } from "@/lib/cards/types";

/** Open-cycle total without prior statement balance carried forward. */
export function openCycleTotalWithoutCarry(
  o: Pick<OpenCycleEstimate, "newSpend" | "interestEstimate">
): number {
  return roundMoney(o.newSpend + o.interestEstimate);
}

export function openCycleDisplayTotal(
  o: OpenCycleEstimate,
  excludeCarriedForward: boolean
): number {
  if (!excludeCarriedForward) return o.estimatedTotal;
  return openCycleTotalWithoutCarry(o);
}

export type OpenCycleAggregates = {
  cardCount: number;
  /** Sum of estimatedTotal (always includes carried forward). */
  estimatedTotal: number;
  /** Stat-tile total; may exclude carried forward when toggled. */
  displayTotal: number;
  newSpend: number;
  carriedForward: number;
  interestEstimate: number;
  minDaysLeft: number;
};

export function aggregateOpenCycles(
  cycles: OpenCycleEstimate[],
  excludeCarriedForward: boolean
): OpenCycleAggregates {
  if (cycles.length === 0) {
    return {
      cardCount: 0,
      estimatedTotal: 0,
      displayTotal: 0,
      newSpend: 0,
      carriedForward: 0,
      interestEstimate: 0,
      minDaysLeft: 0,
    };
  }

  return {
    cardCount: cycles.length,
    estimatedTotal: roundMoney(
      cycles.reduce((s, o) => s + o.estimatedTotal, 0)
    ),
    displayTotal: roundMoney(
      cycles.reduce(
        (s, o) => s + openCycleDisplayTotal(o, excludeCarriedForward),
        0
      )
    ),
    newSpend: roundMoney(cycles.reduce((s, o) => s + o.newSpend, 0)),
    carriedForward: roundMoney(cycles.reduce((s, o) => s + o.carriedForward, 0)),
    interestEstimate: roundMoney(
      cycles.reduce((s, o) => s + o.interestEstimate, 0)
    ),
    minDaysLeft: Math.min(...cycles.map((o) => o.daysLeftInCycle)),
  };
}
