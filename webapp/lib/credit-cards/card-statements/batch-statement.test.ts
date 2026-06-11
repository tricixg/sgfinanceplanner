import { describe, expect, it } from "vitest";
import type { DbCardStatement } from "./mappers";
import { findStatementForBatchOffset } from "./batch-statement";

function stmt(close: string): DbCardStatement {
  return {
    id: close,
    userId: "u",
    creditCardId: "c",
    statementCloseDate: close,
    cycleStartDate: "2026-01-01",
    cycleEndDate: close,
    paymentDueDate: "2026-02-01",
    carriedForwardIn: 0,
    actualAmount: null,
    minimumDue: null,
    trackedAmount: 0,
    amountPaid: 0,
    interestAccrued: 0,
    paidAt: null,
    paymentFinancialAccountId: null,
    paymentSavingsTransactionId: null,
  };
}

describe("findStatementForBatchOffset", () => {
  const rows = [
    stmt("2026-05-12"),
    stmt("2026-05-21"),
    stmt("2026-06-12"),
    stmt("2026-06-21"),
  ];

  it("shows May batch for all cards before earliest unlock day", () => {
    expect(
      findStatementForBatchOffset(rows, { statementDay: 12 }, "2026-06-11", 12, 0)
        ?.statementCloseDate
    ).toBe("2026-05-12");
    expect(
      findStatementForBatchOffset(rows, { statementDay: 21 }, "2026-06-11", 12, 0)
        ?.statementCloseDate
    ).toBe("2026-05-21");
  });

  it("shows June batch for all cards on earliest unlock day", () => {
    expect(
      findStatementForBatchOffset(rows, { statementDay: 12 }, "2026-06-12", 12, 0)
        ?.statementCloseDate
    ).toBe("2026-06-12");
    expect(
      findStatementForBatchOffset(rows, { statementDay: 21 }, "2026-06-12", 12, 0)
        ?.statementCloseDate
    ).toBe("2026-06-21");
  });
});
