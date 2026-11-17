import { describe, expect, it } from "vitest";
import type { BudgetLineRow } from "@/lib/expenses/budget-match";
import {
  budgetLineRowsForMonth,
  budgetMonthStatus,
  isBudgetMonthEditable,
  isYm,
  resolveBudgetMonth,
} from "./monthly";

const line = (id: string, amt: number) => ({ id, cat: id, amt, type: "fixed" as const });

describe("resolveBudgetMonth", () => {
  it("returns empty when nothing configured", () => {
    expect(resolveBudgetMonth({}, "2026-11")).toEqual({ lines: [], sourceYm: null, isOwn: false });
  });
  it("picks latest on/before, else earliest", () => {
    const months = { "2026-10": [line("a", 1)], "2026-12": [line("a", 2)] };
    const r = (ym: string) => resolveBudgetMonth(months, ym);
    expect(["2026-03", "2026-10", "2026-11", "2026-12", "2027-05"].map((y) => r(y).sourceYm)).toEqual([
      "2026-10", "2026-10", "2026-10", "2026-12", "2026-12",
    ]);
    expect(["2026-03", "2026-10", "2026-11", "2026-12", "2027-05"].map((y) => r(y).isOwn)).toEqual([
      false, true, false, true, false,
    ]);
  });
});

describe("isYm / editable / status", () => {
  it("validates ym", () => {
    expect(["2026-11", "2026-13", "2026-1", "abc"].map(isYm)).toEqual([true, false, false, false]);
  });
  it("editable window", () => {
    expect(["2026-10", "2026-11", "2026-12", "2027-01"].map((y) => isBudgetMonthEditable(y, "2026-11"))).toEqual([
      false, true, true, false,
    ]);
    expect(isBudgetMonthEditable("2027-01", "2026-12")).toBe(true);
  });
  it("status", () => {
    expect(["2026-10", "2026-11", "2026-12", "2027-01"].map((y) => budgetMonthStatus(y, "2026-11"))).toEqual([
      "past", "current", "next", "future",
    ]);
  });
});

describe("budgetLineRowsForMonth", () => {
  it("lists month lines then inactive catalog rows, skipping save", () => {
    const cat = (id: string, t: BudgetLineRow["lineType"], i: number): BudgetLineRow => ({
      id, category: id, amount: 0, lineType: t, sortOrder: i,
    });
    const catalog = [cat("Household", "fixed", 0), cat("Living", "spend", 1), cat("Investing", "invest", 2), cat("Old", "spend", 3), cat("Legacy", "save", 4)];
    const months = {
      "2026-10": [
        { id: "Household", cat: "Household", amt: 500, type: "fixed" as const },
        { id: "Living", cat: "Living", amt: 800, type: "spend" as const },
        { id: "Investing", cat: "Investing", amt: 1000, type: "invest" as const },
      ],
    };
    const rows = budgetLineRowsForMonth(catalog, months, "2026-11");
    expect(rows.map((r) => [r.id, r.amount, r.inactive])).toEqual([
      ["Household", 500, undefined],
      ["Living", 800, undefined],
      ["Investing", 1000, undefined],
      ["Old", 0, true],
    ]);
  });
});
