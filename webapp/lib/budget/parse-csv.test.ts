import { describe, expect, it } from "vitest";
import { parseBudgetCsv, parseCsvRows } from "@/lib/budget/parse-csv";

describe("parseCsvRows", () => {
  it("parses quoted fields with commas", () => {
    const rows = parseCsvRows('a,b\n"hello, world",2');
    expect(rows).toEqual([
      ["a", "b"],
      ["hello, world", "2"],
    ]);
  });
});

describe("parseBudgetCsv", () => {
  it("maps spreadsheet headers to rows", () => {
    const csv = [
      "Ledger,Category,Subcategory,Currency,Price,Account,Recorder,Date,Time,Tag,Note,Transaction",
      "Tricia,Food & Drink,Dinner,SGD,25.50,DBS Bank,Tricia,2026-05-31,14:43,,lunch,Expense",
    ].join("\n");

    const { rows, skipped, errors } = parseBudgetCsv(csv);
    expect(errors).toHaveLength(0);
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ledger: "Tricia",
      category: "Food & Drink",
      subcategory: "Dinner",
      currency: "SGD",
      amount: 25.5,
      account: "DBS Bank",
      spentAt: "2026-05-31",
      transactionType: "expense",
    });
  });

  it("rejects empty files", () => {
    const { rows, errors } = parseBudgetCsv("only,header");
    expect(rows).toHaveLength(0);
    expect(errors.length).toBeGreaterThan(0);
  });
});
