import { describe, expect, it } from "vitest";
import {
  buildSavingsSnapshot,
  effectiveCash,
  effectiveMonthlySave,
} from "./savings-totals";

describe("savings-totals", () => {
  it("effectiveCash uses net-worth cash and excludes joint by default", () => {
    const snap = buildSavingsSnapshot(
      [
        {
          id: "1",
          userId: "u",
          name: "Savings",
          balance: 1000,
          notes: "",
          sortOrder: 0,
          includeInSavings: true,
        },
        {
          id: "2",
          userId: "u",
          name: "Wallet",
          balance: 300,
          notes: "",
          sortOrder: 1,
          includeInSavings: false,
        },
      ],
      [
        {
          id: "p",
          householdId: "h",
          name: "Joint",
          balance: 500,
          notes: "",
          sortOrder: 0,
          includeInSavings: true,
        },
      ],
      []
    );
    expect(snap.personalSavingsCash).toBe(1000);
    expect(snap.personalNetWorthCash).toBe(1300);
    expect(effectiveCash(snap, false)).toBe(1300);
    expect(effectiveCash(snap, true)).toBe(1800);
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
          startDate: null,
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
          startDate: null,
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
