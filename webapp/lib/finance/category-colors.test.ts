import { describe, expect, it } from "vitest";
import { AUTO_ILP_ID } from "@/lib/expenses/auto-category-ids";
import { COMPUTED_DEBT_LABEL } from "@/lib/finance/budget";
import { COMPUTED_ILP_LABEL } from "@/lib/finance/ilp";
import {
  AUTO_CATEGORY_COLORS,
  buildCategoryColors,
  CATEGORY_PALETTE,
  OTHER_CATEGORY_COLOR,
  UNCATEGORIZED_COLOR,
} from "./category-colors";

describe("buildCategoryColors", () => {
  const order = ["line-food", "line-transport", "line-work"];

  it("gives budget lines a palette slot by catalog position", () => {
    const color = buildCategoryColors(order);
    expect(color("line-food", "Food")).toBe(CATEGORY_PALETTE[0]);
    expect(color("line-transport", "Transport")).toBe(CATEGORY_PALETTE[1]);
    expect(color("line-work", "Work")).toBe(CATEGORY_PALETTE[2]);
  });

  it("is independent of which categories a view happens to show or their rank", () => {
    const a = buildCategoryColors(order);
    const b = buildCategoryColors(order);
    // A view showing only Work still colours it the same as one showing everything.
    expect(a("line-work", "Work")).toBe(b("line-work"));
  });

  it("keeps existing colours when a new line is appended", () => {
    const before = buildCategoryColors(order);
    const after = buildCategoryColors([...order, "line-new"]);
    for (const id of order) expect(after(id)).toBe(before(id));
  });

  it("uses fixed colours for computed categories, by id or label", () => {
    const color = buildCategoryColors(order);
    expect(color(AUTO_ILP_ID)).toBe(AUTO_CATEGORY_COLORS.ilp);
    expect(color("__uncategorized__:ilp premiums (from investment)", COMPUTED_ILP_LABEL)).toBe(
      AUTO_CATEGORY_COLORS.ilp
    );
    expect(color(null, COMPUTED_DEBT_LABEL)).toBe(AUTO_CATEGORY_COLORS.debt);
  });

  it("greys out Other and Uncategorized", () => {
    const color = buildCategoryColors(order);
    expect(color("__other__", "Other (5)")).toBe(OTHER_CATEGORY_COLOR);
    expect(color("__uncategorized__", "Uncategorized")).toBe(UNCATEGORIZED_COLOR);
  });

  it("gives unmatched categories a stable colour from their name", () => {
    const color = buildCategoryColors(order);
    const first = color("__uncategorized__:gifts", "Gifts");
    expect(CATEGORY_PALETTE).toContain(first);
    expect(buildCategoryColors([])("__uncategorized__:gifts", "  gifts ")).toBe(first);
  });
});
