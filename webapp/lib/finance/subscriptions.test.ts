import { describe, expect, it } from "vitest";
import { recurringFloorsByBudgetLine } from "@/lib/finance/subscriptions";

describe("recurringFloorsByBudgetLine", () => {
  it("sums amounts linked to the same budget line, ignoring unlinked items", () => {
    const floors = recurringFloorsByBudgetLine(
      [
        { budgetLineId: "cat-1", amount: 15 },
        { budgetLineId: undefined, amount: 999 },
      ],
      "2025-05"
    );
    expect(floors.get("cat-1")).toBe(15);
    expect(floors.size).toBe(1);
  });

  it("merges subscription-shaped and investment-shaped items into one floor per category", () => {
    const subscriptions = [{ budgetLineId: "cat-1", amount: 15 }];
    const investments = [
      { budgetLineId: "cat-1", amount: 200 },
      { budgetLineId: "cat-2", amount: 100 },
    ];
    const floors = recurringFloorsByBudgetLine([...subscriptions, ...investments], "2025-05");
    expect(floors.get("cat-1")).toBe(215);
    expect(floors.get("cat-2")).toBe(100);
  });

  it("excludes items ended before the given month", () => {
    const floors = recurringFloorsByBudgetLine(
      [
        { budgetLineId: "cat-1", amount: 15, endMonth: "2025-01" },
        { budgetLineId: "cat-1", amount: 30, endMonth: "2025-12" },
      ],
      "2025-05"
    );
    expect(floors.get("cat-1")).toBe(30);
  });
});
