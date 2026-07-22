import { describe, expect, it } from "vitest";
import { buildTravelTripSummaries } from "@/lib/travel/summary";
import type { Expense } from "@/lib/savings/types";
import type { TravelTrip, TravelTripBudget } from "@/lib/travel/types";

describe("buildTravelTripSummaries", () => {
  it("aggregates budgeted and spent per trip", () => {
    const trips: TravelTrip[] = [
      {
        id: "t1",
        userId: "u1",
        name: "Japan Spring",
        country: "Japan",
        startDate: "2026-03-10",
        endDate: "2026-03-20",
        status: "planned",
        sortOrder: 0,
      },
    ];
    const budgets: TravelTripBudget[] = [
      {
        id: "b1",
        userId: "u1",
        tripId: "t1",
        subCategory: "Flights",
        budgetAmount: 1200,
        sortOrder: 0,
      },
      {
        id: "b2",
        userId: "u1",
        tripId: "t1",
        subCategory: "Accoms",
        budgetAmount: 800,
        sortOrder: 1,
      },
    ];
    const expenses: Expense[] = [
      {
        id: "e1",
        userId: "u1",
        amount: 900,
        category: "Travel",
        budgetLineId: null,
        entrySource: "manual",
        autoCategory: null,
        loanId: null,
        insurancePolicyId: null,
        ilpPolicyId: null,
        subscriptionId: null,
        investmentId: null,
        fundId: null,
        financialAccountId: null,
        spentAt: "2026-03-11",
        note: "Japan Spring - Flights",
        createdAt: "2026-03-11T00:00:00Z",
      },
      {
        id: "e3",
        userId: "u1",
        amount: 300,
        category: "Travel",
        budgetLineId: null,
        entrySource: "manual",
        autoCategory: null,
        loanId: null,
        insurancePolicyId: null,
        ilpPolicyId: null,
        subscriptionId: null,
        investmentId: null,
        fundId: null,
        financialAccountId: null,
        spentAt: "2026-02-01",
        note: "Japan Spring - Accoms",
        createdAt: "2026-02-01T00:00:00Z",
      },
      {
        id: "e2",
        userId: "u1",
        amount: 100,
        category: "Food",
        budgetLineId: null,
        entrySource: "manual",
        autoCategory: null,
        loanId: null,
        insurancePolicyId: null,
        ilpPolicyId: null,
        subscriptionId: null,
        investmentId: null,
        fundId: null,
        financialAccountId: null,
        spentAt: "2026-03-11",
        note: "not travel",
        createdAt: "2026-03-11T00:00:00Z",
      },
    ];

    const out = buildTravelTripSummaries(trips, budgets, expenses);
    expect(out[0]?.budgeted).toBe(2000);
    expect(out[0]?.spent).toBe(1200);
  });
});
