import { describe, expect, it } from "vitest";
import { myShareFromSplit, validateSplitInput } from "@/lib/travel/split";

const companions = new Set(["alex-id"]);

describe("validateSplitInput", () => {
  it("accepts valid custom shares", () => {
    const result = validateSplitInput(100, companions, {
      paidByCompanionId: null,
      shares: [
        { companionId: null, shareAmount: 50 },
        { companionId: "alex-id", shareAmount: 50 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.split?.shares).toHaveLength(2);
    }
  });

  it("rejects shares that do not sum to total", () => {
    const result = validateSplitInput(100, companions, {
      paidByCompanionId: null,
      shares: [
        { companionId: null, shareAmount: 40 },
        { companionId: "alex-id", shareAmount: 50 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects companion paid by when not on trip", () => {
    const result = validateSplitInput(80, companions, {
      paidByCompanionId: "unknown",
      shares: [
        { companionId: null, shareAmount: 40 },
        { companionId: "alex-id", shareAmount: 40 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("myShareFromSplit", () => {
  it("returns full amount when no split", () => {
    expect(myShareFromSplit(null, 100)).toBe(100);
  });

  it("returns user row share when split exists", () => {
    expect(
      myShareFromSplit(
        {
          paidByCompanionId: null,
          shares: [
            { companionId: null, shareAmount: 50 },
            { companionId: "alex-id", shareAmount: 50 },
          ],
        },
        100
      )
    ).toBe(50);
  });
});
