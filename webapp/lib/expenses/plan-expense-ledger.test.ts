import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planExpenseLedger, type ExpenseLedgerDraft } from "@/lib/expenses/ledger-sync";

function supabaseWithAccount(account: Record<string, unknown> | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: account, error: null }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const draft = (over: Partial<ExpenseLedgerDraft> = {}): ExpenseLedgerDraft => ({
  id: "",
  financialAccountId: "fa-1",
  amount: 42.5,
  note: "",
  category: "Food",
  autoCategory: null,
  spentAt: "2026-11-18",
  spentTime: "12:30:00",
  ...over,
});

describe("planExpenseLedger (same rows the old createExpenseLedger wrote)", () => {
  it("cash account linked to savings → withdrawal plan with the SGT occurred_at and note", async () => {
    const sb = supabaseWithAccount({ id: "fa-1", account_type: "cash", savings_account_id: "acct-1", name: "DBS" });
    expect(await planExpenseLedger(sb, "u", draft(), { occurredAt: "2026-11-18T04:30:00.000Z" })).toEqual({
      type: "savings",
      account_id: "acct-1",
      occurred_at: "2026-11-18T04:30:00.000Z",
      note: "Food",
    });
  });

  it("credit card → budget_transactions row", async () => {
    const sb = supabaseWithAccount({ id: "fa-1", account_type: "credit_card", savings_account_id: null, name: "Visa" });
    const plan = await planExpenseLedger(sb, "u", draft({ note: "lunch", autoCategory: "subscription" }), {
      occurredAt: "2026-11-18T04:30:00.000Z",
    });
    expect(plan).toEqual({
      type: "budget",
      row: {
        user_id: "u",
        financial_account_id: "fa-1",
        ledger: "Visa",
        category: "Food",
        subcategory: "",
        currency: "SGD",
        amount: 42.5,
        recorder: "",
        spent_at: "2026-11-18",
        spent_time: "04:30:00",
        tag: "",
        note: "lunch",
        transaction_type: "subscription",
        import_batch_id: null,
      },
    });
  });

  it("no pay-from account, or a cash account without a savings link → no ledger write", async () => {
    expect(await planExpenseLedger(supabaseWithAccount(null), "u", draft({ financialAccountId: null }))).toBeNull();
    const sb = supabaseWithAccount({ id: "fa-1", account_type: "cash", savings_account_id: null, name: "Wallet" });
    expect(await planExpenseLedger(sb, "u", draft())).toBeNull();
  });

  it("unknown account → 'Invalid financial account'", async () => {
    await expect(planExpenseLedger(supabaseWithAccount(null), "u", draft())).rejects.toThrow("Invalid financial account");
  });
});
