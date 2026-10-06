import { describe, expect, it } from "vitest";
import { pastCycleUsage } from "@/lib/benefits/history";
import type { BenefitClaim } from "@/lib/benefits/types";

let claimSeq = 0;
function claim(overrides: Partial<BenefitClaim> = {}): BenefitClaim {
  claimSeq += 1;
  return {
    id: `c${claimSeq}`,
    benefitId: "b1",
    amount: 50,
    claimedAt: "2026-05-01",
    note: "",
    sourceRecordType: null,
    sourceRecordId: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("pastCycleUsage", () => {
  it("buckets a monthly benefit's claims into past cycles, newest first, summing same-cycle claims", () => {
    const periods = pastCycleUsage(
      "2026-01-15",
      1,
      [
        claim({ amount: 10, claimedAt: "2026-07-20" }),
        claim({ amount: 20, claimedAt: "2026-08-20" }),
        claim({ amount: 5, claimedAt: "2026-08-25" }),
        claim({ amount: 30, claimedAt: "2026-09-20" }),
      ],
      "2026-10-15"
    );

    expect(periods.map((p) => [p.cycleStart, p.cycleEnd, p.usedInCycle])).toEqual([
      ["2026-09-15", "2026-10-15", 30],
      ["2026-08-15", "2026-09-15", 25],
      ["2026-07-15", "2026-08-15", 10],
    ]);
    // same-cycle claims sorted newest first within the bucket
    expect(periods[1].claims.map((c) => c.claimedAt)).toEqual(["2026-08-25", "2026-08-20"]);
  });

  it("skips an empty cycle between two used ones (annual benefit)", () => {
    const periods = pastCycleUsage(
      "2024-01-01",
      12,
      [
        claim({ amount: 100, claimedAt: "2024-06-01" }),
        // nothing claimed in the 2025-01-01 → 2026-01-01 cycle
        claim({ amount: 200, claimedAt: "2026-06-01" }),
      ],
      "2027-01-01"
    );

    expect(periods.map((p) => [p.cycleStart, p.cycleEnd, p.usedInCycle])).toEqual([
      ["2026-01-01", "2027-01-01", 200],
      ["2024-01-01", "2025-01-01", 100],
    ]);
  });

  it("returns empty for a one-time benefit (cycleMonths null)", () => {
    const periods = pastCycleUsage(
      "2024-01-01",
      null,
      [claim({ amount: 100, claimedAt: "2024-06-01" })],
      "2027-01-01"
    );
    expect(periods).toEqual([]);
  });

  it("returns empty when there are no claims", () => {
    expect(pastCycleUsage("2026-01-01", 12, [], "2027-01-01")).toEqual([]);
  });

  it("returns empty when every claim is within the current cycle", () => {
    const periods = pastCycleUsage(
      "2026-01-01",
      12,
      [claim({ amount: 80, claimedAt: "2026-06-01" })],
      "2026-01-01"
    );
    expect(periods).toEqual([]);
  });

  it("surfaces claims dated before cycleAnchorDate as one pre-anchor bucket", () => {
    const periods = pastCycleUsage(
      "2026-01-01",
      12,
      [
        claim({ amount: 50, claimedAt: "2025-06-01" }),
        claim({ amount: 25, claimedAt: "2025-09-01" }),
        claim({ amount: 80, claimedAt: "2026-03-01" }),
      ],
      "2027-01-01"
    );

    expect(periods.map((p) => [p.cycleStart, p.cycleEnd, p.usedInCycle])).toEqual([
      ["2026-01-01", "2027-01-01", 80],
      ["2025-06-01", "2026-01-01", 75],
    ]);
    expect(periods[1].claims.map((c) => c.claimedAt)).toEqual(["2025-09-01", "2025-06-01"]);
  });
});
