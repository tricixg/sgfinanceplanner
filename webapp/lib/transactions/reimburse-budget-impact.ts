import type { SupabaseClient } from "@supabase/supabase-js";
import { getBudgetTransactionById } from "@/lib/budget/transactions";
import { mapExpense } from "@/lib/savings/db-mappers";
import { assertReimbursementAllowed } from "@/lib/transactions/reimburse-totals";

type ReimburseRecordType = "expense" | "savings" | "budget";

/**
 * Validates cumulative reimbursement against source gross amount.
 * Does not change expense/budget rows — budget "used" is netted in summary via reimburse-totals.
 */
export async function applyReimbursementBudgetImpact(
  supabase: SupabaseClient,
  userId: string,
  recordType: ReimburseRecordType,
  id: string,
  reimburseAmount: number
): Promise<void> {
  if (recordType === "expense") {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Not found");

    const expense = mapExpense(data);
    await assertReimbursementAllowed(
      supabase,
      userId,
      "expense",
      id,
      expense.amount,
      reimburseAmount
    );
    console.info("[reimburse-budget] expense reimbursement allowed", {
      expenseId: id,
      gross: expense.amount,
      reimburseAmount,
    });
    return;
  }

  if (recordType === "budget") {
    const tx = await getBudgetTransactionById(supabase, userId, id);
    if (!tx) throw new Error("Not found");
    if (tx.transactionType === "income") {
      throw new Error("Cannot reimburse an income entry");
    }

    await assertReimbursementAllowed(
      supabase,
      userId,
      "budget",
      id,
      Math.abs(tx.amount),
      reimburseAmount
    );
    console.info("[reimburse-budget] budget row reimbursement allowed", {
      id,
      gross: Math.abs(tx.amount),
      reimburseAmount,
    });
    return;
  }

  console.info("[reimburse-budget] savings row — no budget cap", { id });
}
