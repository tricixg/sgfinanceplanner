import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./defaults";
import {
  activeOtherLoansOutstanding,
  activePersonalLoansOutstanding,
  activeBtLoansOutstanding,
  btOutstandingByCard,
  activeLoanOutstanding,
} from "./debt";
import type { OtherLoan } from "@/lib/other-loans/types";
import type { Loan } from "@/lib/types";

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

describe("activePersonalLoansOutstanding", () => {
  it("excludes personal loans marked excludeFromNetWorth", () => {
    const excluded: OtherLoan = {
      name: "A", loanType: "personal", principal: 1000, outstanding: 1000,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, excludeFromNetWorth: true,
    };
    const included: OtherLoan = {
      name: "B", loanType: "personal", principal: 500, outstanding: 500,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const total = activePersonalLoansOutstanding({
      ...DEFAULTS,
      otherLoans: [excluded, included],
    });
    expect(total).toBe(500);
  });

  it("never counts balance-transfer loans, even without excludeFromNetWorth", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 2000, outstanding: 2000,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const total = activePersonalLoansOutstanding({ ...DEFAULTS, otherLoans: [bt] });
    expect(total).toBe(0);
  });
});

describe("activeBtLoansOutstanding", () => {
  it("sums unpaid balance-transfer loans and excludes personal loans", () => {
    const bt: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 2000, outstanding: 2000,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const personal: OtherLoan = {
      name: "P", loanType: "personal", principal: 500, outstanding: 500,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const total = activeBtLoansOutstanding({ ...DEFAULTS, otherLoans: [bt, personal] });
    expect(total).toBe(2000);
  });

  it("excludes balance-transfer loans already marked paid", () => {
    const paid: OtherLoan = {
      name: "BT", loanType: "balance_transfer", principal: 2000, outstanding: 2000,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 2000, paidAt: "2026-01-01",
    };
    const total = activeBtLoansOutstanding({ ...DEFAULTS, otherLoans: [paid] });
    expect(total).toBe(0);
  });
});

describe("btOutstandingByCard", () => {
  it("groups balance-transfer outstanding by linked card, ignoring unlinked/paid/personal rows", () => {
    const btCardA1: OtherLoan = {
      name: "BT A1", loanType: "balance_transfer", principal: 1000, outstanding: 1000,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-a",
    };
    const btCardA2: OtherLoan = {
      name: "BT A2", loanType: "balance_transfer", principal: 400, outstanding: 400,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-a",
    };
    const btCardB: OtherLoan = {
      name: "BT B", loanType: "balance_transfer", principal: 300, outstanding: 300,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0, sourceCreditCardId: "card-b",
    };
    const btUnlinked: OtherLoan = {
      name: "BT unlinked", loanType: "balance_transfer", principal: 200, outstanding: 200,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const btPaid: OtherLoan = {
      name: "BT paid", loanType: "balance_transfer", principal: 999, outstanding: 999,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 999, paidAt: "2026-01-01",
      sourceCreditCardId: "card-a",
    };
    const personal: OtherLoan = {
      name: "Personal", loanType: "personal", principal: 100, outstanding: 100,
      interestRateApr: 0, feesPaid: 0, monthly: 0, amountPaid: 0,
    };
    const map = btOutstandingByCard({
      ...DEFAULTS,
      otherLoans: [btCardA1, btCardA2, btCardB, btUnlinked, btPaid, personal],
    });
    expect(map.get("card-a")).toBe(1400);
    expect(map.get("card-b")).toBe(300);
    expect(map.has("card-c")).toBe(false);
    expect([...map.values()].reduce((s, v) => s + v, 0)).toBe(1700);
  });
});

describe("activeLoanOutstanding", () => {
  it("sums only active loans (end month not yet passed) with a positive monthly", () => {
    const nowYm = "2026-08";
    const active: Loan = { name: "Active", card: "", monthly: 100, out: 500, end: "2026-12" };
    const ended: Loan = { name: "Ended", card: "", monthly: 100, out: 200, end: "2026-01" };
    const zeroMonthly: Loan = { name: "Zero", card: "", monthly: 0, out: 999, end: "2027-01" };
    const total = activeLoanOutstanding(
      { ...DEFAULTS, loans: [active, ended, zeroMonthly] },
      nowYm
    );
    expect(total).toBe(500);
  });
});
