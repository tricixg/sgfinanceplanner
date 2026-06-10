import { describe, expect, it } from "vitest";
import {
  isBalanceTransferPromoActive,
  subtractBtFinanceChargesFromDailySpend,
} from "./interest-free";

describe("isBalanceTransferPromoActive", () => {
  it("treats missing due date as still in promo", () => {
    expect(isBalanceTransferPromoActive({}, "2026-05-29")).toBe(true);
  });

  it("ends promo after due date", () => {
    expect(
      isBalanceTransferPromoActive({ dueDate: "2026-05-28" }, "2026-05-29")
    ).toBe(false);
    expect(
      isBalanceTransferPromoActive({ dueDate: "2026-05-29" }, "2026-05-29")
    ).toBe(true);
  });
});

describe("subtractBtFinanceChargesFromDailySpend", () => {
  it("removes BT finance charge from the spend day", () => {
    const out = subtractBtFinanceChargesFromDailySpend(
      { "2026-06-01": 68.5, "2026-06-02": 20 },
      { "2026-06-01": 18.5 }
    );
    expect(out).toEqual({ "2026-06-01": 50, "2026-06-02": 20 });
  });

  it("drops the day when only the finance charge was posted", () => {
    const out = subtractBtFinanceChargesFromDailySpend(
      { "2026-06-01": 18.5 },
      { "2026-06-01": 18.5 }
    );
    expect(out).toEqual({});
  });
});
