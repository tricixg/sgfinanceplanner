import { describe, expect, it } from "vitest";
import { relinkedBudgetLineId } from "./budget-line-link";
import type { BudgetLineRow } from "./budget-match";

const line = (id: string, category: string, lineType: BudgetLineRow["lineType"] = "spend") =>
  ({ id, category, amount: 100, lineType, sortOrder: 0 }) as BudgetLineRow;

const lines = [
  line("living", "Living & variable spend"),
  line("work", "Work"),
  line("rent", "Rent", "fixed"),
  line("invest", "Index funds", "invest"),
];

describe("relinkedBudgetLineId", () => {
  it("moves the link to the line matching the new category", () => {
    expect(relinkedBudgetLineId(lines, "Living & variable spend", "Work")).toBe("work");
    expect(relinkedBudgetLineId(lines, "Work", "Rent")).toBe("rent");
  });

  it("matches the new category ignoring case and spacing", () => {
    expect(relinkedBudgetLineId(lines, "Work", "  living & VARIABLE spend ")).toBe("living");
  });

  it("clears the link when no expense line has that name", () => {
    expect(relinkedBudgetLineId(lines, "Work", "Something new")).toBeNull();
    expect(relinkedBudgetLineId(lines, "Work", "Index funds")).toBeNull();
    expect(relinkedBudgetLineId(lines, "Work", "")).toBeNull();
  });

  it("leaves the link alone when the text is not really changing", () => {
    expect(relinkedBudgetLineId(lines, "Work", "Work")).toBeUndefined();
    expect(relinkedBudgetLineId(lines, "Work", " work ")).toBeUndefined();
    // e.g. an old name still linked to a since-renamed line: an unrelated edit keeps the link.
    expect(relinkedBudgetLineId(lines, "Food", "Food")).toBeUndefined();
  });

  it("links a previously unlinked expense once its text matches a line", () => {
    expect(relinkedBudgetLineId(lines, null, "Work")).toBe("work");
  });
});
