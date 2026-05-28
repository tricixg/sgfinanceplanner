import { describe, expect, it } from "vitest";
import {
  amountForPaymentDue,
  resolveAmountForClose,
} from "@/lib/credit-cards/card-statements/calendar-amounts";

describe("amountForPaymentDue", () => {
  it("matches by payment due date and card id", () => {
    const entries = [
      {
        creditCardId: "c1",
        statementCloseDate: "2026-05-05",
        paymentDueDate: "2026-06-25",
        actualAmount: 1500,
      },
    ];
    expect(amountForPaymentDue(entries, "c1", "2026-06-25")).toBe(1500);
    expect(amountForPaymentDue(entries, "c1", "2026-05-25")).toBeNull();
  });
});

describe("resolveAmountForClose", () => {
  it("matches exact close date", () => {
    const map = new Map([["2026-04-05", 1200]]);
    expect(resolveAmountForClose(map, "2026-04-05")).toBe(1200);
  });

  it("falls back to same-month close when projected day differs", () => {
    const map = new Map([["2026-04-06", 900]]);
    expect(resolveAmountForClose(map, "2026-04-05")).toBe(900);
  });
});
