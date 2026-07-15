import { describe, expect, it } from "vitest";
import {
  autoPaymentInsertRow,
  validateAutoPaymentPayload,
} from "@/lib/expenses/auto-payment";

describe("validateAutoPaymentPayload", () => {
  it("requires loanId for debt", () => {
    const r = validateAutoPaymentPayload({ autoCategory: "debt" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/loanId/);
  });

  it("accepts valid debt payload", () => {
    const r = validateAutoPaymentPayload({
      autoCategory: "debt",
      loanId: "uuid-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.autoCategory).toBe("debt");
  });

  it("requires insurancePolicyId for insurance", () => {
    const r = validateAutoPaymentPayload({ autoCategory: "insurance" });
    expect(r.ok).toBe(false);
  });

  it("requires subscriptionId for subscription", () => {
    const r = validateAutoPaymentPayload({ autoCategory: "subscription" });
    expect(r.ok).toBe(false);
  });

  it("accepts subscription payload", () => {
    const r = validateAutoPaymentPayload({
      autoCategory: "subscription",
      subscriptionId: "sub-1",
    });
    expect(r.ok).toBe(true);
  });
});

describe("autoPaymentInsertRow", () => {
  it("sets category label and foreign keys for debt", () => {
    const row = autoPaymentInsertRow("user-1", {
      autoCategory: "debt",
      loanId: "loan-1",
      amount: 250,
      spentAt: "2025-05-15",
      note: "instalment",
    });
    expect(row.auto_category).toBe("debt");
    expect(row.loan_id).toBe("loan-1");
    expect(row.budget_line_id).toBeNull();
    expect(row.entry_source).toBe("recurring");
    expect(row.category).toContain("Loans");
  });

  it("falls back to the Other Recurring label when a subscription has no linked category", () => {
    const row = autoPaymentInsertRow("user-1", {
      autoCategory: "subscription",
      subscriptionId: "sub-1",
      amount: 15,
      spentAt: "2025-05-15",
    });
    expect(row.budget_line_id).toBeNull();
    expect(row.category).toBe("Other Recurring");
    expect(row.subscription_id).toBe("sub-1");
  });

  it("tags a linked subscription payment with its real category", () => {
    const row = autoPaymentInsertRow(
      "user-1",
      {
        autoCategory: "subscription",
        subscriptionId: "sub-1",
        amount: 15,
        spentAt: "2025-05-15",
      },
      { budgetLineId: "cat-1", category: "Household" }
    );
    expect(row.budget_line_id).toBe("cat-1");
    expect(row.category).toBe("Household");
    expect(row.subscription_id).toBe("sub-1");
  });
});

describe("debt outstanding adjust (math)", () => {
  it("decreases outstanding on payment, floored at zero", () => {
    const outstanding = 1000;
    const payment = 300;
    expect(Math.max(0, outstanding - payment)).toBe(700);
  });

  it("restores outstanding when payment deleted", () => {
    const outstandingAfterPayment = 700;
    const payment = 300;
    expect(outstandingAfterPayment + payment).toBe(1000);
  });

  it("does not go below zero on overpayment", () => {
    expect(Math.max(0, 100 - 150)).toBe(0);
  });
});
