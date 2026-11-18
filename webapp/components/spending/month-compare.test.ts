import { describe, expect, it } from "vitest";
import { buildMonthCompareRows } from "./month-compare";

const item = (id: string, amount: number) => ({ id, label: id, amount });

describe("buildMonthCompareRows", () => {
  const current = [item("shopping", 985), item("food", 378), item("travel", 79)];
  const previous = [item("shopping", 1210), item("food", 600), item("others", 40)];

  it("includes categories from either month", () => {
    const { rows } = buildMonthCompareRows(current, previous);
    expect(rows.map((r) => r.id).sort()).toEqual(["food", "others", "shopping", "travel"]);
  });

  it("shows a category spent only last month at $0 this month", () => {
    const others = buildMonthCompareRows(current, previous).rows.find((r) => r.id === "others")!;
    expect(others.amount).toBe(0);
    expect(others.prevAmount).toBe(40);
    expect(others.change).toBe(-1);
  });

  it("has no change figure when there was nothing to compare against", () => {
    const travel = buildMonthCompareRows(current, previous).rows.find((r) => r.id === "travel")!;
    expect(travel.prevAmount).toBe(0);
    expect(travel.change).toBeNull();
  });

  it("sorts by this month's spend, then last month's", () => {
    const { rows } = buildMonthCompareRows(current, previous);
    expect(rows.map((r) => r.id)).toEqual(["shopping", "food", "travel", "others"]);
  });

  it("scales to the largest amount in either month", () => {
    expect(buildMonthCompareRows(current, previous).scale).toBe(1210);
  });

  it("skips categories with no spend in either month", () => {
    const { rows, scale } = buildMonthCompareRows([item("a", 0)], [item("a", 0)]);
    expect(rows).toEqual([]);
    expect(scale).toBe(0);
  });
});
