import { describe, expect, it } from "vitest";
import { netBudgetSpend } from "@/lib/transactions/reimburse-totals";

describe("netBudgetSpend", () => {
  it("subtracts reimbursements from gross for budget used", () => {
    expect(netBudgetSpend(100, 40)).toBe(60);
  });

  it("returns zero when fully reimbursed", () => {
    expect(netBudgetSpend(50, 50)).toBe(0);
  });

  it("does not go negative", () => {
    expect(netBudgetSpend(30, 50)).toBe(0);
  });
});
