import { describe, expect, it } from "vitest";
import { computeBenefitUsage } from "@/lib/benefits/usage";
import type { Benefit, BenefitClaim } from "@/lib/benefits/types";

function benefit(overrides: Partial<Benefit> = {}): Benefit {
  return {
    id: "b1",
    userId: "u1",
    name: "Dental",
    limitAmount: 300,
    cycleMonths: 12,
    cycleAnchorDate: "2026-01-01",
    incomeCategoryId: null,
    notes: "",
    sortOrder: 0,
    hidden: false,
    ...overrides,
  };
}

function claim(overrides: Partial<BenefitClaim> = {}): BenefitClaim {
  return {
    id: "c1",
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

describe("computeBenefitUsage", () => {
  it("counts only claims inside the current cycle for recurring benefits", () => {
    const usage = computeBenefitUsage(
      benefit(),
      [
        claim({ id: "c1", amount: 50, claimedAt: "2025-06-01" }), // predates the anchor
        claim({ id: "c2", amount: 80, claimedAt: "2026-02-01" }), // current cycle
      ],
      "2026-10-06"
    );
    expect(usage.cycleStart).toBe("2026-01-01");
    expect(usage.cycleEnd).toBe("2027-01-01");
    expect(usage.usedInCycle).toBe(80);
    expect(usage.remaining).toBe(220);
    expect(usage.totalClaimed).toBe(130);
    expect(usage.currentCycleClaims.map((c) => c.id)).toEqual(["c2"]);
    // the pre-anchor claim isn't dropped — it surfaces as a past "pre-anchor" cycle
    expect(usage.pastCycles).toEqual([
      {
        cycleStart: "2025-06-01",
        cycleEnd: "2026-01-01",
        usedInCycle: 50,
        claims: [expect.objectContaining({ id: "c1" })],
      },
    ]);
  });

  it("resets a monthly benefit (e.g. Communication) every month", () => {
    const usage = computeBenefitUsage(
      benefit({ cycleMonths: 1, cycleAnchorDate: "2026-01-15", limitAmount: 50 }),
      [
        claim({ id: "c1", amount: 40, claimedAt: "2026-08-20" }), // previous month cycle
        claim({ id: "c2", amount: 20, claimedAt: "2026-10-02" }), // current month cycle
      ],
      "2026-10-06"
    );
    expect(usage.cycleStart).toBe("2026-09-15");
    expect(usage.cycleEnd).toBe("2026-10-15");
    expect(usage.usedInCycle).toBe(20);
    expect(usage.remaining).toBe(30);
    // the prior month's claim shows up as a genuine past cycle, not just totalClaimed
    expect(usage.pastCycles).toEqual([
      {
        cycleStart: "2026-08-15",
        cycleEnd: "2026-09-15",
        usedInCycle: 40,
        claims: [expect.objectContaining({ id: "c1" })],
      },
    ]);
  });

  it("never caps a no-limit benefit — remaining is null", () => {
    const usage = computeBenefitUsage(
      benefit({ limitAmount: null }),
      [claim({ amount: 500, claimedAt: "2026-05-01" })],
      "2026-10-06"
    );
    expect(usage.remaining).toBeNull();
    expect(usage.usedInCycle).toBe(500);
  });

  it("never resets a one-time benefit — remaining depletes forever", () => {
    const usage = computeBenefitUsage(
      benefit({ cycleMonths: null, limitAmount: 500, cycleAnchorDate: "2025-01-01" }),
      [claim({ amount: 200, claimedAt: "2025-03-01" }), claim({ amount: 150, claimedAt: "2026-09-01" })],
      "2026-10-06"
    );
    expect(usage.cycleEnd).toBeNull();
    expect(usage.usedInCycle).toBe(350);
    expect(usage.remaining).toBe(150);
    expect(usage.totalClaimed).toBe(350);
  });

  it("clamps remaining to 0 instead of going negative on rounding noise", () => {
    const usage = computeBenefitUsage(
      benefit({ limitAmount: 45 }),
      [claim({ amount: 15, claimedAt: "2026-06-01" }), claim({ amount: 15, claimedAt: "2026-06-02" }), claim({ amount: 15, claimedAt: "2026-06-03" })],
      "2026-10-06"
    );
    expect(usage.remaining).toBe(0);
  });

  it("allows remaining to go negative when over-claimed", () => {
    const usage = computeBenefitUsage(
      benefit({ limitAmount: 100 }),
      [claim({ amount: 140, claimedAt: "2026-06-01" })],
      "2026-10-06"
    );
    expect(usage.remaining).toBe(-40);
  });
});
