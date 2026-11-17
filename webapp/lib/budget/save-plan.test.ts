import { describe, expect, it } from "vitest";
import type { BudgetLineRow } from "@/lib/expenses/budget-match";
import { classifyRemovedLines, planBudgetMonthSave } from "./save-plan";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = id(1), B = id(2), C = id(3);
const catalog: BudgetLineRow[] = [
  { id: A, category: "A", amount: 0, lineType: "fixed", sortOrder: 0 },
  { id: B, category: "B", amount: 0, lineType: "spend", sortOrder: 1 },
];
const base = { ym: "2026-11", catalog, months: {}, floors: new Map<string, number>() };

describe("planBudgetMonthSave", () => {
  it("matches by id with new name", () => {
    const p = planBudgetMonthSave({ ...base, incoming: [{ id: A, cat: "Renamed", amt: 1, type: "fixed" }] });
    expect(p.lines[0].matchId).toBe(A);
    expect(p.lines[0].category).toBe("Renamed");
  });
  it("matches by category + type, else null", () => {
    const p = planBudgetMonthSave({
      ...base,
      incoming: [{ cat: "B", amt: 1, type: "spend" }, { cat: "Z", amt: 1, type: "spend" }],
    });
    expect(p.lines.map((l) => l.matchId)).toEqual([B, null]);
  });
  it("applies floor and rounding", () => {
    const p = planBudgetMonthSave({
      ...base,
      floors: new Map([[A, 120]]),
      incoming: [
        { id: A, cat: "A", amt: 50, type: "fixed" },
        { cat: "x", amt: -5, type: "spend" },
        { cat: "y", amt: NaN, type: "spend" },
        { cat: "z", amt: 10.006, type: "spend" },
      ],
    });
    expect(p.lines.map((l) => l.amount)).toEqual([120, 0, 0, 10.01]);
  });
  it("drops save lines", () => {
    const p = planBudgetMonthSave({ ...base, incoming: [{ cat: "s", amt: 1, type: "save" }] });
    expect(p.lines).toEqual([]);
  });
  it("reports removed ids", () => {
    const months = {
      "2026-10": [
        { id: A, cat: "A", amt: 1, type: "fixed" as const },
        { id: B, cat: "B", amt: 1, type: "spend" as const },
      ],
    };
    const p = planBudgetMonthSave({ ...base, months, incoming: [{ id: A, cat: "A", amt: 1, type: "fixed" }] });
    expect(p.removedIds).toEqual([B]);
  });
});

describe("classifyRemovedLines", () => {
  const l = (i: string) => ({ id: i, cat: i, amt: 1, type: "fixed" as const });
  it("unlinks when only in other months", () => {
    expect(
      classifyRemovedLines({
        removedIds: [B],
        monthsAfter: { "2026-10": [l(A), l(B)], "2026-11": [l(A)] },
        currentYm: "2026-11",
      })
    ).toEqual({ hardDelete: [], unlinkRecurring: [B] });
  });
  it("hard deletes when in no month", () => {
    expect(
      classifyRemovedLines({ removedIds: [C], monthsAfter: { "2026-11": [l(A)] }, currentYm: "2026-11" })
    ).toEqual({ hardDelete: [C], unlinkRecurring: [] });
  });
  it("keeps when still in next month", () => {
    expect(
      classifyRemovedLines({
        removedIds: [B],
        monthsAfter: { "2026-11": [l(A), l(B)], "2026-12": [l(A)] },
        currentYm: "2026-11",
      })
    ).toEqual({ hardDelete: [], unlinkRecurring: [] });
  });
});
