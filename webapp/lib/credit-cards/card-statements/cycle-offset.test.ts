import { describe, expect, it } from "vitest";
import type { DbCardStatement } from "./mappers";
import { findClosedStatementAtOffset } from "./load";

function stmt(close: string, cycleEnd: string): DbCardStatement {
  return {
    id: close,
    userId: "u",
    creditCardId: "c",
    statementCloseDate: close,
    cycleStartDate: "2026-01-01",
    cycleEndDate: cycleEnd,
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
  } as DbCardStatement;
}

describe("findClosedStatementAtOffset", () => {
  const rows = [
    stmt("2026-05-21", "2026-05-20"),
    stmt("2026-04-21", "2026-04-20"),
    stmt("2026-03-21", "2026-03-20"),
  ];

  it("returns latest closed at offset 0", () => {
    expect(findClosedStatementAtOffset(rows, "2026-05-29", 0)?.statementCloseDate).toBe(
      "2026-05-21"
    );
  });

  it("steps one cycle back at offset 1", () => {
    expect(findClosedStatementAtOffset(rows, "2026-05-29", 1)?.statementCloseDate).toBe(
      "2026-04-21"
    );
  });

  it("returns undefined when offset exceeds history", () => {
    expect(findClosedStatementAtOffset(rows, "2026-05-29", 5)).toBeUndefined();
  });

  it("includes statement on its close date", () => {
    const juneClose = stmt("2026-06-12", "2026-06-12");
    expect(
      findClosedStatementAtOffset([juneClose], "2026-06-12", 0)?.statementCloseDate
    ).toBe("2026-06-12");
    expect(findClosedStatementAtOffset([juneClose], "2026-06-11", 0)).toBeUndefined();
  });
});
