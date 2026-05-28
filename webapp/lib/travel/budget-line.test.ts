import { describe, expect, it } from "vitest";
import { appendTravelBudgetLine, hasTravelBudgetLine } from "@/lib/travel/budget-line";
import type { BudgetItem } from "@/lib/types";

describe("travel budget line helpers", () => {
  it("detects travel spend line", () => {
    const lines: BudgetItem[] = [{ cat: "Travel", amt: 0, type: "spend" }];
    expect(hasTravelBudgetLine(lines)).toBe(true);
  });

  it("appends travel spend line when missing", () => {
    const lines: BudgetItem[] = [{ cat: "Food", amt: 100, type: "spend" }];
    const out = appendTravelBudgetLine(lines);
    expect(out.some((l) => l.cat === "Travel" && l.type === "spend")).toBe(true);
  });
});
