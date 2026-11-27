import { describe, expect, it } from "vitest";
import { interestFlagPatch } from "@/lib/income/interest-flag";

const adj = { kind: "adjustment", amount: 12.5, accountId: "a1", incomeCategoryId: null };

describe("interestFlagPatch", () => {
  it("marks a positive cash-account adjustment as an Interest deposit", () => {
    expect(interestFlagPatch(adj, true, "int")).toEqual({
      patch: { kind: "deposit", income_category_id: "int" },
    });
  });

  it("rejects a negative adjustment", () => {
    expect(interestFlagPatch({ ...adj, amount: -3 }, true, "int")).toEqual({
      error: "Interest must increase the balance",
    });
  });

  it("rejects non-adjustment rows and pool rows", () => {
    expect(interestFlagPatch({ ...adj, kind: "withdrawal" }, true, "int")).toHaveProperty("error");
    expect(
      interestFlagPatch({ ...adj, kind: "deposit", incomeCategoryId: "salary" }, true, "int")
    ).toHaveProperty("error");
    expect(interestFlagPatch({ ...adj, accountId: null }, true, "int")).toHaveProperty("error");
  });

  it("is a no-op when already in the requested state", () => {
    const interest = { ...adj, kind: "deposit", incomeCategoryId: "int" };
    expect(interestFlagPatch(interest, true, "int")).toEqual({ patch: null });
    expect(interestFlagPatch(adj, false, "int")).toEqual({ patch: null });
  });

  it("undo turns an Interest deposit back into a plain adjustment", () => {
    const interest = { ...adj, kind: "deposit", incomeCategoryId: "int" };
    expect(interestFlagPatch(interest, false, "int")).toEqual({
      patch: { kind: "adjustment", income_category_id: null },
    });
  });

  it("undo refuses deposits in other categories", () => {
    expect(
      interestFlagPatch({ ...adj, kind: "deposit", incomeCategoryId: "salary" }, false, "int")
    ).toEqual({ error: "This entry is not marked as interest" });
  });

  it("errors when the Interest category is missing", () => {
    expect(interestFlagPatch(adj, true, null)).toHaveProperty("error");
  });
});
