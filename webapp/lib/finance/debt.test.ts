import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import { activeOtherLoansOutstanding } from "./debt";
import type { OtherLoan } from "@/lib/other-loans/types";

describe("activeOtherLoansOutstanding", () => {
  it("excludes personal loans marked excludeFromNetWorth", () => {
    const personal: OtherLoan = {
      name: "Family loan",
      loanType: "personal",
      principal: 5000,
      outstanding: 3000,
      interestRateApr: 0,
      feesPaid: 0,
      monthly: 0,
      amountPaid: 0,
      excludeFromNetWorth: true,
    };
    const bt: OtherLoan = {
      name: "BT",
      loanType: "balance_transfer",
      principal: 2000,
      outstanding: 2000,
      interestRateApr: 0,
      feesPaid: 0,
      monthly: 0,
      amountPaid: 0,
    };
    const total = activeOtherLoansOutstanding({
      ...DEFAULTS,
      otherLoans: [personal, bt],
    });
    expect(total).toBe(2000);
  });

  it("includes personal loans when not excluded", () => {
    const personal: OtherLoan = {
      name: "Loan",
      loanType: "personal",
      principal: 1000,
      outstanding: 1000,
      interestRateApr: 0,
      feesPaid: 0,
      monthly: 0,
      amountPaid: 0,
    };
    const total = activeOtherLoansOutstanding({
      ...DEFAULTS,
      otherLoans: [personal],
    });
    expect(total).toBe(1000);
  });
});
