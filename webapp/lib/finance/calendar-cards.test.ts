import { describe, expect, it } from "vitest";
import {
  getCardCalendarEvents,
  projectCardCalendarCyclesForMonth,
  sumStatementBalancesClosedInMonth,
  sumStatementBalancesFromCycles,
} from "@/lib/finance/calendar-cards";

describe("projectCardCalendarCyclesForMonth", () => {
  it("projects statement and payment dates for a future month", () => {
    const cycles = projectCardCalendarCyclesForMonth(
      { name: "DBS", statementDay: 5, paymentDueDay: 25 },
      "2026-08"
    );
    expect(cycles).toContainEqual({
      cardName: "DBS",
      statementCloseDate: "2026-08-05",
      paymentDueDate: "2026-09-25",
      actualAmount: null,
    });
    expect(cycles).toContainEqual({
      cardName: "DBS",
      statementCloseDate: "2026-07-05",
      paymentDueDate: "2026-08-25",
      actualAmount: null,
    });
  });

  it("uses saved actualAmount when present for payment due", () => {
    const amounts = new Map<string, number | null>([
      ["2026-07-05", 900],
    ]);
    const events = getCardCalendarEvents(
      "2026-08",
      projectCardCalendarCyclesForMonth(
        { name: "DBS", statementDay: 5, paymentDueDay: 25 },
        "2026-08",
        amounts
      )
    );
    expect(events).toContainEqual({
      day: 25,
      type: "payment",
      label: "DBS — payment due",
      amount: 900,
    });
  });
});

describe("sumStatementBalancesClosedInMonth", () => {
  it("sums amounts only for statements closing in viewYm", () => {
    const total = sumStatementBalancesClosedInMonth("2026-05", [
      {
        creditCardId: "a",
        statementCloseDate: "2026-05-05",
        actualAmount: 1000,
      },
      {
        creditCardId: "b",
        statementCloseDate: "2026-05-10",
        actualAmount: 500,
      },
      {
        creditCardId: "a",
        statementCloseDate: "2026-04-05",
        actualAmount: 200,
      },
    ]);
    expect(total).toBe(1500);
  });
});

describe("getCardCalendarEvents", () => {
  it("shows payment amount only when actualAmount is entered", () => {
    const events = getCardCalendarEvents("2025-05", [
      {
        cardName: "DBS",
        statementCloseDate: "2025-05-05",
        paymentDueDate: "2025-05-25",
        actualAmount: 1200,
      },
    ]);
    expect(events).toContainEqual({
      day: 5,
      type: "statement",
      label: "DBS — statement",
    });
    expect(events).toContainEqual({
      day: 25,
      type: "payment",
      label: "DBS — payment due",
      amount: 1200,
    });
  });

  it("sumStatementBalancesFromCycles matches entries for same month", () => {
    const entries = [
      {
        creditCardId: "a",
        statementCloseDate: "2026-05-05",
        actualAmount: 800,
      },
    ];
    const cycles = projectCardCalendarCyclesForMonth(
      { name: "DBS", statementDay: 5, paymentDueDay: 25 },
      "2026-05",
      new Map([["2026-05-05", 800]])
    );
    expect(sumStatementBalancesFromCycles("2026-05", cycles)).toBe(800);
    expect(sumStatementBalancesClosedInMonth("2026-05", entries)).toBe(800);
  });

  it("omits payment amount when statement not entered yet", () => {
    const events = getCardCalendarEvents("2025-05", [
      {
        cardName: "UOB",
        statementCloseDate: "2025-05-10",
        paymentDueDate: "2025-05-28",
        actualAmount: null,
      },
    ]);
    const payment = events.find((e) => e.type === "payment");
    expect(payment?.amount).toBeUndefined();
  });
});
