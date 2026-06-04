import { describe, expect, it } from "vitest";
import {
  expenseEntrySourceLabel,
  parseExpenseEntrySource,
} from "@/lib/expenses/entry-source";

describe("parseExpenseEntrySource", () => {
  it("accepts known sources", () => {
    expect(parseExpenseEntrySource("telegram")).toBe("telegram");
    expect(parseExpenseEntrySource("manual")).toBe("manual");
  });

  it("rejects unknown values", () => {
    expect(parseExpenseEntrySource("import")).toBeNull();
    expect(parseExpenseEntrySource(null)).toBeNull();
  });
});

describe("expenseEntrySourceLabel", () => {
  it("defaults to manual", () => {
    expect(expenseEntrySourceLabel(undefined)).toBe("manual");
  });

  it("returns telegram label", () => {
    expect(expenseEntrySourceLabel("telegram")).toBe("telegram");
  });
});
