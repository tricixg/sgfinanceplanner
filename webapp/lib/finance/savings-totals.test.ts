import { describe, expect, it } from "vitest";
import {
  buildSavingsSnapshot,
  effectiveCash,
  effectiveMonthlySave,
} from "./savings-totals";

describe("savings-totals", () => {
  it("effectiveCash excludes joint by default", () => {
    const snap = buildSavingsSnapshot(
      [{ id: "1", userId: "u", name: "A", balance: 1000, notes: "", sortOrder: 0 }],
      [{ id: "p", householdId: "h", name: "Joint", balance: 500, notes: "", sortOrder: 0 }],
      []
    );
    expect(effectiveCash(snap, false)).toBe(1000);
    expect(effectiveCash(snap, true)).toBe(1500);
  });

  it("effectiveMonthlySave sums goal contributions by scope", () => {
    const snap = buildSavingsSnapshot(
      [],
      [],
      [
        {
          id: "g1",
          scope: "individual",
          ownerUserId: "u",
          householdId: null,
          name: "Trip",
          targetAmount: 5000,
          savedAmount: 0,
          targetDate: null,
          monthlyContribution: 200,
          whereLabel: "",
          linkedAccountId: null,
          linkedPoolId: null,
          sortOrder: 0,
        },
        {
          id: "g2",
          scope: "shared",
          ownerUserId: null,
          householdId: "h",
          name: "Wedding",
          targetAmount: 20000,
          savedAmount: 0,
          targetDate: null,
          monthlyContribution: 800,
          whereLabel: "",
          linkedAccountId: null,
          linkedPoolId: null,
          sortOrder: 1,
        },
      ]
    );
    expect(effectiveMonthlySave(snap, false)).toBe(200);
    expect(effectiveMonthlySave(snap, true)).toBe(1000);
  });
});
