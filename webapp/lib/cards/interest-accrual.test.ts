import { describe, expect, it } from "vitest";
import {
  accrueDailyInterest,
  balanceTransferWithinStatement,
  outstandingBalance,
  principalAtDue,
  statementCarryIn,
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

  it("adds carried forward to legacy new-charges-only statements", () => {
    expect(
      statementCarryIn({ carriedForwardIn: 5000, actualAmount: 800 })
    ).toBe(5000);
  });

  it("does not add carried forward to a bank-total statement", () => {
    const stmt = {
      carriedForwardIn: 5000,
      actualAmount: 5800,
      amountIncludesPriorBalance: true,
    };
    expect(statementCarryIn(stmt)).toBe(0);
    expect(
      outstandingBalance({
        carriedForwardIn: statementCarryIn(stmt),
        actualAmount: stmt.actualAmount,
        interestAccrued: 0,
        amountPaid: 0,
      })
    ).toBe(5800);
  });

  it("keeps carried forward on a bank-total statement until an amount is entered", () => {
    expect(
      statementCarryIn({
        carriedForwardIn: 5000,
        actualAmount: null,
        amountIncludesPriorBalance: true,
      })
    ).toBe(5000);
  });

  it("finds BT inside a bank-total statement", () => {
    const stmt = {
      carriedForwardIn: 0,
      actualAmount: 5800,
      amountIncludesPriorBalance: true,
    };
    expect(balanceTransferWithinStatement(stmt, 5800, 5000)).toBe(5000);
    expect(balanceTransferWithinStatement(stmt, 3000, 5000)).toBe(3000);
  });

  it("finds BT in a legacy statement only via the carried balance", () => {
    expect(
      balanceTransferWithinStatement(
        { carriedForwardIn: 0, actualAmount: 800 },
        800,
        5000
      )
    ).toBe(0);
    expect(
      balanceTransferWithinStatement(
        { carriedForwardIn: 5000, actualAmount: 800 },
        5800,
        5000
      )
    ).toBe(5000);
  });
});
