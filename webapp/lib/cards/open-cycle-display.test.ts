import { describe, expect, it } from "vitest";
import {
  aggregateOpenCycles,
  openCycleDisplayTotal,
} from "@/lib/cards/open-cycle-display";
import type { OpenCycleEstimate } from "@/lib/cards/types";

const sample: OpenCycleEstimate = {
  creditCardId: "1",
  creditCardKey: "dbs",
  cardName: "DBS",
  statementCloseDate: "2026-06-05",
  cycleStartDate: "2026-05-05",
  cycleEndDate: "2026-06-04",
  carriedForward: 500,
  newSpend: 200,
  interestEstimate: 10,
  estimatedTotal: 710,
  daysLeftInCycle: 12,
};

describe("openCycleDisplayTotal", () => {
  it("uses estimatedTotal when carry is included", () => {
    expect(openCycleDisplayTotal(sample, false)).toBe(710);
  });

  it("drops carried forward when excluded", () => {
    expect(openCycleDisplayTotal(sample, true)).toBe(210);
  });
});

describe("aggregateOpenCycles", () => {
  it("sums display totals across cards", () => {
    const agg = aggregateOpenCycles(
      [
        sample,
        {
          ...sample,
          creditCardId: "2",
          cardName: "UOB",
          carriedForward: 0,
          newSpend: 80,
          interestEstimate: 20,
          estimatedTotal: 100,
        },
      ],
      true
    );
    expect(agg.cardCount).toBe(2);
    expect(agg.displayTotal).toBe(310);
  });
});
