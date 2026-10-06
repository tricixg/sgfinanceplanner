import { describe, expect, it } from "vitest";
import { DEFAULT_INCOME_CATEGORIES } from "@/lib/income/defaults";

describe("DEFAULT_INCOME_CATEGORIES", () => {
  it("marks salary as non-additive baseline", () => {
    const salary = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "salary");
    expect(salary?.countsAsAdditive).toBe(false);
    expect(salary?.countsInBaseline).toBe(true);
  });

  it("marks comms as additive, not baseline (tracked as a benefit instead)", () => {
    const comms = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "comms");
    expect(comms?.countsAsAdditive).toBe(true);
    expect(comms?.countsInBaseline).toBe(false);
  });

  it("marks poker and others as additive", () => {
    const poker = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "poker");
    const others = DEFAULT_INCOME_CATEGORIES.find((c) => c.slug === "others");
    expect(poker?.countsAsAdditive).toBe(true);
    expect(others?.countsAsAdditive).toBe(true);
  });
});
