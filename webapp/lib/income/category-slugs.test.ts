import { describe, expect, it } from "vitest";
import { DEFAULT_INCOME_CATEGORIES } from "@/lib/income/defaults";

describe("DEFAULT_INCOME_CATEGORIES", () => {
  it("marks salary and comms as non-additive", () => {
    const salary = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "salary");
    const comms = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "comms");
    expect(salary?.countsAsAdditive).toBe(false);
    expect(comms?.countsAsAdditive).toBe(false);
  });

  it("marks poker and others as additive", () => {
    const poker = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "poker");
    const others = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "others");
    expect(poker?.countsAsAdditive).toBe(true);
    expect(others?.countsAsAdditive).toBe(true);
  });
});
