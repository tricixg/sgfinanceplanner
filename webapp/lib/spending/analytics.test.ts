import { describe, expect, it } from "vitest";
import { buildSpendingAnalytics } from "./analytics";
import type { BudgetLineRow } from "@/lib/expenses/budget-match";
import type { LeanExpenseRow, LeanImportRow } from "./bucket-spend";
import { bucketSpendRows } from "./bucket-spend";

const budgetLines: BudgetLineRow[] = [
  {
    id: "line-dining",
    category: "Dining",
    amount: 500,
    lineType: "spend",
    sortOrder: 1,
  },
  {
    id: "line-groceries",
    category: "Groceries",
    amount: 400,
    lineType: "spend",
    sortOrder: 2,
  },
  {
    id: "line-rent",
    category: "Rent",
    amount: 2000,
    lineType: "fixed",
    sortOrder: 0,
  },
];

const cards = [
  { financialAccountId: "card-a", name: "UOB One" },
  { financialAccountId: "card-b", name: "DBS Live Fresh" },
];

describe("bucketSpendRows", () => {
  it("buckets by month, category, and card with reimbursements", () => {
    const expenses: LeanExpenseRow[] = [
      {
        id: "e1",
        amount: 100,
        spentAt: "2026-03-15",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: "card-a",
      },
      {
        id: "e2",
        amount: 50,
        spentAt: "2026-03-20",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: null,
      },
    ];
    const { byYmCategory, byYmCard, byYmCardCategory } = bucketSpendRows({
      scope: "all",
      budgetLines,
      expenses,
      imports: [],
      reimbursements: {
        expense: new Map([["e1", 20]]),
        budget: new Map(),
      },
      cardLabels: new Map([
        ["card-a", "UOB One"],
        ["card-b", "DBS Live Fresh"],
      ]),
    });

    expect(byYmCategory.get("2026-03")?.get("line-dining")?.amount).toBe(130);
    expect(byYmCard.get("2026-03")?.get("card-a")?.amount).toBe(80);
    expect(byYmCard.get("2026-03")?.get("__cash__")?.amount).toBe(50);
    expect(
      byYmCardCategory.get("2026-03")?.get("card-a")?.get("line-dining")?.amount
    ).toBe(80);
    expect(
      byYmCardCategory.get("2026-03")?.get("__cash__")?.get("line-dining")?.amount
    ).toBe(50);
  });

  it("excludes auto and fixed categories in discretionary scope", () => {
    const expenses: LeanExpenseRow[] = [
      {
        id: "e1",
        amount: 100,
        spentAt: "2026-03-10",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: "card-a",
      },
      {
        id: "e2",
        amount: 2000,
        spentAt: "2026-03-10",
        category: "Rent",
        budgetLineId: "line-rent",
        financialAccountId: null,
        autoCategory: null,
      },
      {
        id: "e3",
        amount: 80,
        spentAt: "2026-03-12",
        category: "Debt",
        budgetLineId: null,
        financialAccountId: null,
        autoCategory: "debt",
      },
    ];
    const { byYmCategory } = bucketSpendRows({
      scope: "discretionary",
      budgetLines,
      expenses,
      imports: [],
      reimbursements: { expense: new Map(), budget: new Map() },
      cardLabels: new Map([["card-a", "UOB One"]]),
    });

    expect(byYmCategory.get("2026-03")?.get("line-dining")?.amount).toBe(100);
    expect(byYmCategory.get("2026-03")?.get("line-rent")).toBeUndefined();
    expect(byYmCategory.get("2026-03")?.size).toBe(1);
  });

  it("keeps unmatched categories separate instead of merging into one label", () => {
    // Neither "Household" nor "Balance transfer finance charge" matches a
    // budget line here, e.g. because the budget line was renamed/removed
    // (Household) or is never linked to one by design (BT finance charge).
    const expenses: LeanExpenseRow[] = [
      {
        id: "e1",
        amount: 600,
        spentAt: "2026-05-05",
        category: "Household",
        budgetLineId: null,
        financialAccountId: null,
      },
      {
        id: "e2",
        amount: 250,
        spentAt: "2026-05-10",
        category: "Balance transfer finance charge",
        budgetLineId: null,
        financialAccountId: null,
      },
    ];
    const { byYmCategory } = bucketSpendRows({
      scope: "all",
      budgetLines,
      expenses,
      imports: [],
      reimbursements: { expense: new Map(), budget: new Map() },
      cardLabels: new Map(),
    });

    const monthCats = byYmCategory.get("2026-05");
    const labels = [...(monthCats?.values() ?? [])].map((v) => v.label).sort();
    expect(labels).toEqual(["Balance transfer finance charge", "Household"]);
    expect(
      [...(monthCats?.values() ?? [])].find((v) => v.label === "Household")?.amount
    ).toBe(600);
    expect(
      [...(monthCats?.values() ?? [])].find(
        (v) => v.label === "Balance transfer finance charge"
      )?.amount
    ).toBe(250);
  });
});

describe("buildSpendingAnalytics", () => {
  it("aggregates multiple months and computes insights", () => {
    const expenses: LeanExpenseRow[] = [
      {
        id: "e1",
        amount: 300,
        spentAt: "2026-01-10",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: "card-a",
      },
      {
        id: "e2",
        amount: 400,
        spentAt: "2026-02-10",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: "card-a",
      },
      {
        id: "e3",
        amount: 150,
        spentAt: "2026-02-15",
        category: "Groceries",
        budgetLineId: "line-groceries",
        financialAccountId: "card-b",
      },
    ];
    const imports: LeanImportRow[] = [
      {
        id: "b1",
        amount: 100,
        spentAt: "2026-03-05",
        category: "Dining",
        transactionType: "expense",
        financialAccountId: "card-a",
      },
    ];

    const bundle = buildSpendingAnalytics({
      throughYm: "2026-03",
      months: 3,
      scope: "all",
      budgetLines,
      expenses,
      imports,
      reimbursements: { expense: new Map(), budget: new Map() },
      cards,
    });

    expect(bundle.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(bundle.monthly[0]?.total).toBe(300);
    expect(bundle.monthly[1]?.total).toBe(550);
    expect(bundle.monthly[2]?.total).toBe(100);
    expect(bundle.insights.momChangePct["2026-01"]).toBeNull();
    expect(bundle.insights.momChangePct["2026-02"]).toBeCloseTo(83.3, 0);
    expect(bundle.insights.topCategories[0]?.id).toBe("line-dining");
    // Latest month (Mar) vs Feb: dining fell 400→100, groceries absent — no MoM increases.
    expect(bundle.insights.momIncreases).toHaveLength(0);
    expect(bundle.insights.budgetVariance.find((r) => r.id === "line-dining")?.over).toBe(
      -700
    );
    expect(bundle.perAccount.map((a) => a.accountId).sort()).toEqual(["card-a", "card-b"]);
    const uob = bundle.perAccount.find((a) => a.accountId === "card-a");
    expect(uob?.monthly[0]?.byCategory.find((c) => c.id === "line-dining")?.amount).toBe(
      300
    );
    expect(uob?.monthly[1]?.byCategory.find((c) => c.id === "line-dining")?.amount).toBe(
      400
    );
  });

  it("returns null mom when prior month had zero spend", () => {
    const expenses: LeanExpenseRow[] = [
      {
        id: "e1",
        amount: 200,
        spentAt: "2026-02-05",
        category: "Dining",
        budgetLineId: "line-dining",
        financialAccountId: "card-a",
      },
    ];
    const bundle = buildSpendingAnalytics({
      throughYm: "2026-02",
      months: 2,
      scope: "all",
      budgetLines,
      expenses,
      imports: [],
      reimbursements: { expense: new Map(), budget: new Map() },
      cards,
    });

    expect(bundle.insights.momChangePct["2026-02"]).toBeNull();
  });
});
