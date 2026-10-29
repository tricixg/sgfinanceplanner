import { describe, expect, it } from "vitest";
import {
  DEFAULT_ONCALL_SETTINGS,
  computeAmounts,
  daysInclusive,
  daysInYear,
  findOncallIncomeCategory,
  owedDays,
  paidDaysByEntry,
  paymentAmounts,
  salaryMonthsForEntry,
  summarizeOncall,
} from "@/lib/oncall/calc";
import type { OncallEntry, OncallPayment } from "@/lib/oncall/types";

const settings = { ...DEFAULT_ONCALL_SETTINGS, dailyRate: 60 };

function entry(id: string, startDate: string, endDate: string, dailyRate = 60): OncallEntry {
  return { id, startDate, endDate, dailyRate, note: "" };
}

function payment(
  id: string,
  salaryMonth: string,
  amount: number,
  items: [string, number][],
  deposited = true
): OncallPayment {
  return {
    id,
    receivedOn: `${salaryMonth}-28`,
    salaryMonth,
    amount,
    deposited,
    accountId: deposited ? "acc" : null,
    incomeCategoryId: deposited ? "cat" : null,
    savingsTransactionId: deposited ? `tx-${id}` : null,
    note: "",
    items: items.map(([entryId, days], i) => ({ id: `${id}-${i}`, entryId, days })),
  };
}

describe("daysInclusive", () => {
  it("counts both the start and end date", () => {
    expect(daysInclusive("2026-10-12", "2026-10-18")).toBe(7);
    expect(daysInclusive("2026-10-12", "2026-10-12")).toBe(1);
  });

  it("returns 0 for reversed or missing dates", () => {
    expect(daysInclusive("2026-10-18", "2026-10-12")).toBe(0);
    expect(daysInclusive("", "2026-10-12")).toBe(0);
  });

  it("spans month and leap-day boundaries", () => {
    expect(daysInclusive("2028-02-27", "2028-03-01")).toBe(4);
  });
});

describe("daysInYear", () => {
  it("only counts the days of a stretch that fall in the year", () => {
    const e = entry("e", "2025-12-29", "2026-01-04");
    expect(daysInYear(e, 2025)).toBe(3);
    expect(daysInYear(e, 2026)).toBe(4);
    expect(daysInYear(e, 2027)).toBe(0);
  });
});

describe("computeAmounts", () => {
  it("takes employee CPF off gross and adds employer CPF on top", () => {
    const a = computeAmounts(7, 60, settings);
    expect(a.gross).toBe(420);
    expect(a.employeeCpf).toBeCloseTo(84);
    expect(a.employerCpf).toBeCloseTo(71.4);
    expect(a.takeHome).toBeCloseTo(336);
  });

  it("skips CPF when it doesn't apply", () => {
    const a = computeAmounts(7, 60, { ...settings, cpfApplies: false });
    expect(a.employeeCpf).toBe(0);
    expect(a.employerCpf).toBe(0);
    expect(a.takeHome).toBe(420);
  });
});

describe("partial payments", () => {
  const entries = [entry("a", "2026-08-24", "2026-08-30"), entry("b", "2026-10-12", "2026-10-18", 80)];
  const payments = [payment("p1", "2026-09", 240, [["a", 5]]), payment("p2", "2026-10", 96, [["a", 2]])];

  it("adds up paid days across payslips", () => {
    const paid = paidDaysByEntry(payments);
    expect(paid.get("a")).toBe(7);
    expect(owedDays(entries[0], paid)).toBe(0);
    expect(owedDays(entries[1], paid)).toBe(7);
  });

  it("lists the salary months that paid a stretch", () => {
    expect(salaryMonthsForEntry(payments, "a")).toEqual(["2026-09", "2026-10"]);
    expect(salaryMonthsForEntry(payments, "b")).toEqual([]);
  });

  it("works out a payment's pay at each stretch's own rate", () => {
    const a = paymentAmounts(payment("p", "2026-11", 0, [["a", 2], ["b", 3]]), entries, settings);
    expect(a.days).toBe(5);
    expect(a.gross).toBe(2 * 60 + 3 * 80);
  });
});

describe("summarizeOncall", () => {
  const entries = [
    entry("old", "2025-11-17", "2025-11-23"),
    entry("cross", "2025-12-29", "2026-01-04"),
    entry("new", "2026-10-12", "2026-10-18"),
  ];
  const payments = [
    payment("p1", "2025-12", 336, [["old", 7]], false),
    payment("p2", "2026-01", 144, [["cross", 3]]),
    payment("p3", "2026-02", 192, [["cross", 4]]),
  ];

  it("YTD earns by on-call date and receives by salary month", () => {
    const s = summarizeOncall(entries, payments, settings, "ytd", 2026);
    expect(s.earned.days).toBe(4 + 7);
    expect(s.stretches).toBe(2);
    expect(s.received).toBe(144 + 192);
    expect(s.receivedCount).toBe(2);
    expect(s.receivedWithoutDeposit).toBe(0);
  });

  it("lifetime counts everything, including payments logged without a deposit", () => {
    const s = summarizeOncall(entries, payments, settings, "lifetime", 2026);
    expect(s.earned.days).toBe(21);
    expect(s.received).toBe(336 + 144 + 192);
    expect(s.receivedWithoutDeposit).toBe(336);
  });

  it("awaiting payment is always all-time", () => {
    const s = summarizeOncall(entries, payments, settings, "ytd", 2027);
    expect(s.owed.days).toBe(7);
    expect(s.owedStretches).toBe(1);
    expect(s.owed.takeHome).toBeCloseTo(336);
  });
});

describe("findOncallIncomeCategory", () => {
  it("finds the user's existing on-call category by name", () => {
    const cats = [{ id: "s", name: "Salary" }, { id: "o", name: "On-call Allowance" }];
    expect(findOncallIncomeCategory(cats)?.id).toBe("o");
    expect(findOncallIncomeCategory([{ id: "x", name: "Oncall pay" }])?.id).toBe("x");
    expect(findOncallIncomeCategory([{ id: "s", name: "Salary" }])).toBeUndefined();
  });
});
