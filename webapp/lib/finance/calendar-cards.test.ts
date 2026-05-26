import { describe, expect, it } from "vitest";
import { getCardCalendarEvents } from "@/lib/finance/calendar-cards";

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
