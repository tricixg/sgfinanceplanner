import { describe, expect, it } from "vitest";
import { inferBtPaymentForUndo, splitCardPaymentAmount } from "@/lib/credit-cards/card-statements/pay";

describe("splitCardPaymentAmount", () => {
  it("allocates overflow to balance transfer after non-BT is covered", () => {
    const { payToNonBt, btPayment } = splitCardPaymentAmount(1200, 1500, 800);
    expect(payToNonBt).toBe(700);
    expect(btPayment).toBe(500);
  });

  it("allocates nothing to BT when payment fits non-BT only", () => {
    const { btPayment } = splitCardPaymentAmount(500, 1500, 800);
    expect(btPayment).toBe(0);
  });
});

describe("inferBtPaymentForUndo", () => {
  it("recovers BT portion for undo after a mixed payment", () => {
    const outstandingBefore = 1500;
    const btOutstandingNow = 300;
    const btPayment = inferBtPaymentForUndo(1200, outstandingBefore, btOutstandingNow);
    expect(btPayment).toBe(500);
  });
});
