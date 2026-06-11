import { describe, expect, it } from "vitest";
import { buildCompanionBalances, totalPendingReimbursement } from "@/lib/travel/balances";
import type { TravelCompanion } from "@/lib/travel/types";

const alex: TravelCompanion = {
  id: "alex-id",
  userId: "u1",
  tripId: "t1",
  name: "Alex",
  sortOrder: 0,
};

describe("buildCompanionBalances", () => {
  it("tracks you-paid split and companion-paid split", () => {
    const rows = buildCompanionBalances(
      [alex],
      [
        {
          id: "e1",
          amount: 100,
          split: {
            paidByCompanionId: null,
            shares: [
              { companionId: null, shareAmount: 50 },
              { companionId: "alex-id", shareAmount: 50 },
            ],
          },
        },
        {
          id: "e2",
          amount: 80,
          split: {
            paidByCompanionId: "alex-id",
            shares: [
              { companionId: null, shareAmount: 40 },
              { companionId: "alex-id", shareAmount: 40 },
            ],
          },
        },
      ],
      []
    );

    expect(rows[0]?.owesYou).toBe(50);
    expect(rows[0]?.youOwe).toBe(40);
    expect(rows[0]?.paid).toBe(80);
    expect(rows[0]?.pendingReimbursement).toBe(10);
  });

  it("reduces pending when settlement received", () => {
    const rows = buildCompanionBalances(
      [alex],
      [
        {
          id: "e1",
          amount: 100,
          split: {
            paidByCompanionId: null,
            shares: [
              { companionId: null, shareAmount: 50 },
              { companionId: "alex-id", shareAmount: 50 },
            ],
          },
        },
      ],
      [
        {
          id: "s1",
          userId: "u1",
          tripId: "t1",
          companionId: "alex-id",
          direction: "received",
          amount: 50,
          settledAt: "2026-03-12",
          note: "",
          financialAccountId: null,
          savingsTransactionId: null,
        },
      ]
    );

    expect(rows[0]?.pendingReimbursement).toBe(0);
    expect(totalPendingReimbursement(rows)).toBe(0);
  });
});
