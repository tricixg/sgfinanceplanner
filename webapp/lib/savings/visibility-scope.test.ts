import { describe, expect, it } from "vitest";
import {
  accountIdInSavingsScope,
  poolIdInSavingsScope,
  savingsScopeOrFilter,
} from "@/lib/savings/visibility-scope";

describe("savingsScopeOrFilter", () => {
  it("builds OR filter for accounts and pools", () => {
    expect(
      savingsScopeOrFilter({
        accountIds: ["a1", "a2"],
        poolIds: ["p1"],
      })
    ).toBe("account_id.in.(a1,a2),pool_id.in.(p1)");
  });

  it("returns null when user has no accounts or pools", () => {
    expect(savingsScopeOrFilter({ accountIds: [], poolIds: [] })).toBeNull();
  });
});

describe("scope membership checks", () => {
  const scope = { accountIds: ["a1"], poolIds: ["p1"] };

  it("checks account membership", () => {
    expect(accountIdInSavingsScope(scope, "a1")).toBe(true);
    expect(accountIdInSavingsScope(scope, "a2")).toBe(false);
  });

  it("checks pool membership", () => {
    expect(poolIdInSavingsScope(scope, "p1")).toBe(true);
    expect(poolIdInSavingsScope(scope, "p2")).toBe(false);
  });
});
