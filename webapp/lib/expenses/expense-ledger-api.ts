import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense } from "@/lib/savings/types";
import { createExpenseLedger, reverseExpenseLedger } from "@/lib/expenses/ledger-sync";
import { adjustLoanOutstanding } from "@/lib/expenses/auto-payment";

export async function syncExpenseLedgerAfterCreate(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense,
  opts: { loanId?: string; loanPaymentAmount?: number } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!expense.financialAccountId) {
    return { ok: true };
  }

  try {
    await createExpenseLedger(supabase, userId, expense);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ledger sync failed";
    console.error("[expense-ledger] create failed, rolling back", {
      expenseId: expense.id,
      message,
    });

    if (opts.loanId && opts.loanPaymentAmount != null) {
      const adj = await adjustLoanOutstanding(
        supabase,
        userId,
        opts.loanId,
        opts.loanPaymentAmount
      );
      if (!adj.ok) {
        console.error("[expense-ledger] loan rollback failed", adj.error);
      }
    }

    await supabase.from("expenses").delete().eq("id", expense.id).eq("user_id", userId);
    return { ok: false, error: message };
  }
}

export async function syncExpenseLedgerBeforeDelete(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await reverseExpenseLedger(supabase, userId, expense);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ledger reversal failed";
    console.error("[expense-ledger] reverse failed", { expenseId: expense.id, message });
    return { ok: false, error: message };
  }
}
