import { describe, expect, it } from "vitest";
import { normalizeCategoryKey, resolveBudgetLineId, type BudgetLineRow } from "@/lib/expenses/budget-match";
import {
  buildBudgetExpenseSummary,
  partitionBudgetLines,
} from "@/lib/expenses/budget-summary";
import type { Expense } from "@/lib/savings/types";

const lines: BudgetLineRow[] = [
  { id: "a1", category: "Household", amount: 500, lineType: "fixed", sortOrder: 0 },
  { id: "a2", category: "Living & variable spend", amount: 800, lineType: "spend", sortOrder: 1 },
  { id: "a3", category: "Investing", amount: 1000, lineType: "invest", sortOrder: 2 },
  { id: "a4", category: "Misc", amount: 0, lineType: "spend", sortOrder: 3 },
];

function expense(partial: Partial<Expense> & Pick<Expense, "id" | "amount">): Expense {
  return {
    id: partial.id,
    userId: "u1",
    amount: partial.amount,
    category: partial.category ?? "",
    budgetLineId: partial.budgetLineId ?? null,
    spentAt: partial.spentAt ?? "2025-05-10",
    note: partial.note ?? "",
    createdAt: partial.createdAt ?? "2025-05-10T00:00:00Z",
  };
}

describe("budget-match", () => {
  it("normalizeCategoryKey trims and lowercases", () => {
    expect(normalizeCategoryKey("  Food  ")).toBe("food");
  });

  it("resolveBudgetLineId matches by id and category name", () => {
    expect(resolveBudgetLineId(lines, "Household", "a1")).toBe("a1");
    expect(resolveBudgetLineId(lines, "household", null)).toBe("a1");
    expect(resolveBudgetLineId(lines, "Investing", null)).toBeNull();
    expect(resolveBudgetLineId(lines, "Unknown", null)).toBeNull();
  });
});

describe("buildBudgetExpenseSummary", () => {
  it("sums manual and import spend for fixed/spend categories", () => {
    const summary = buildBudgetExpenseSummary(
      "2025-05",
      lines,
      [
        expense({ id: "e1", amount: 120, budgetLineId: "a1" }),
        expense({ id: "e2", amount: 50, category: "Living & variable spend" }),
      ],
      [
        {
          id: "i1",
          amount: 30,
          spentAt: "2025-05-05",
          category: "Household",
          note: "",
          transactionType: "expense",
        },
        {
          id: "i2",
          amount: 200,
          spentAt: "2025-05-06",
          category: "Investing",
          note: "",
          transactionType: "expense",
        },
      ]
    );

    expect(summary.categories).toHaveLength(2);
    expect(summary.categories[0].spent).toBe(150);
    expect(summary.categories[0].remaining).toBe(350);
    expect(summary.categories[1].spent).toBe(50);
    expect(summary.zeroAllocated).toHaveLength(1);
    expect(summary.zeroAllocated[0].category).toBe("Misc");
    expect(summary.totals.spent).toBe(400);
  });

  it("puts unmatched spend in uncategorized", () => {
    const summary = buildBudgetExpenseSummary(
      "2025-05",
      lines,
      [expense({ id: "e1", amount: 25, category: "Coffee" })],
      []
    );
    expect(summary.uncategorized.spent).toBe(25);
  });

  it("ignores income imports for spent totals", () => {
    const summary = buildBudgetExpenseSummary("2025-05", lines, [], [
      {
        id: "i1",
        amount: 500,
        spentAt: "2025-05-01",
        category: "Household",
        note: "",
        transactionType: "income",
      },
    ]);
    expect(summary.categories[0].spent).toBe(0);
  });
});

describe("partitionBudgetLines", () => {
  it("splits allocated vs zero", () => {
    const { allocated, zeroAllocated } = partitionBudgetLines([
      { amt: 100 },
      { amt: 0 },
      { amt: 50 },
    ]);
    expect(allocated).toHaveLength(2);
    expect(zeroAllocated).toHaveLength(1);
  });
});
