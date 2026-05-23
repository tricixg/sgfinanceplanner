import { describe, expect, it } from "vitest";
import {
  accrueDailyInterest,
  outstandingBalance,
  principalAtDue,
} from "./interest-accrual";

describe("interest-accrual", () => {
  it("principal at due subtracts payments", () => {
    expect(
      principalAtDue({
        carriedForwardIn: 100,
        actualAmount: 500,
        amountPaid: 200,
      })
    ).toBe(400);
  });

  it("outstanding includes interest accrued", () => {
    expect(
      outstandingBalance({
        carriedForwardIn: 0,
        actualAmount: 1000,
        interestAccrued: 12.5,
        amountPaid: 500,
      })
    ).toBe(512.5);
  });

  it("accrues daily on balance plus new spend", () => {
    const interest = accrueDailyInterest({
      aprPercent: 365,
      principalAtDue: 100,
      dailySpend: { "2026-06-11": 50 },
      interestStartDate: "2026-06-11",
      throughDate: "2026-06-11",
    });
    // day 1: balance 100 + spend 50 = 150; daily rate 1% => 1.5 interest
    expect(interest).toBe(1.5);
  });

  it("returns zero when principal is zero", () => {
    expect(
      accrueDailyInterest({
        aprPercent: 26,
        principalAtDue: 0,
        dailySpend: {},
        interestStartDate: "2026-06-11",
        throughDate: "2026-06-15",
      })
    ).toBe(0);
  });
});
