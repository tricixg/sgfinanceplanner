import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { adjustLoanOutstanding } from "@/lib/expenses/auto-payment";
import { syncExpenseLedgerBeforeDelete } from "@/lib/expenses/expense-ledger-api";
import { createBudgetTransaction, deleteBudgetTransaction, getBudgetTransactionById } from "@/lib/budget/transactions";
import { syncStatementAfterPaymentTransactionDelete } from "@/lib/credit-cards/card-statements/pay";
import { applyTransaction, deleteSavingsTransaction, getSavingsTransactionById } from "@/lib/savings/ledger";
import { mapExpense } from "@/lib/savings/db-mappers";
import { applyReimbursementBudgetImpact } from "@/lib/transactions/reimburse-budget-impact";
import { formatReimbursementNote } from "@/lib/transactions/reimbursement-note";
import { sgtNowTimeHms, sgtSpentAtToIso, sgtTodayYmd } from "@/lib/time/sgt";

export type TransactionRecordType = "expense" | "savings" | "budget";

export function normalizeRecordType(v: string): TransactionRecordType | null {
  return v === "expense" || v === "savings" || v === "budget" ? v : null;
}

async function deleteLinkedReimbursements(
  supabase: SupabaseClient,
  userId: string,
  recordType: TransactionRecordType,
  id: string
): Promise<void> {
  const [savingsLinks, budgetLinks] = await Promise.all([
    supabase
      .from("savings_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source_record_type", recordType)
      .eq("source_record_id", id),
    supabase
      .from("budget_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("source_record_type", recordType)
      .eq("source_record_id", id),
  ]);

  if (savingsLinks.error) throw new Error(savingsLinks.error.message);
  if (budgetLinks.error) throw new Error(budgetLinks.error.message);

  for (const row of savingsLinks.data ?? []) {
    await deleteSavingsTransaction(supabase, userId, String(row.id));
  }
  for (const row of budgetLinks.data ?? []) {
    await deleteBudgetTransaction(supabase, userId, String(row.id));
  }
}

export async function deleteTransactionWithLedger(
  supabase: SupabaseClient,
  userId: string,
  recordType: TransactionRecordType,
  id: string
): Promise<void> {
  await deleteLinkedReimbursements(supabase, userId, recordType, id);

  if (recordType === "expense") {
    const { data: row, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");

    const expense = mapExpense(row);
    const rev = await syncExpenseLedgerBeforeDelete(supabase, userId, expense);
    if (!rev.ok) throw new Error(rev.error);

    const { error: delErr } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);

    if (row.auto_category === "debt" && row.loan_id) {
      const adj = await adjustLoanOutstanding(
        supabase,
        userId,
        String(row.loan_id),
        Number(row.amount ?? 0)
      );
      if (!adj.ok) {
        console.error("[tx-actions] expense delete loan restore failed", {
          expenseId: id,
          error: adj.error,
        });
      }
    }
    return;
  }

  if (recordType === "savings") {
    const existing = await getSavingsTransactionById(supabase, userId, id);
    if (!existing) throw new Error("Not found");
    await deleteSavingsTransaction(supabase, userId, id);
    await syncStatementAfterPaymentTransactionDelete(supabase, userId, id, existing.amount);
    return;
  }

  const existing = await getBudgetTransactionById(supabase, userId, id);
  if (!existing) throw new Error("Not found");
  await deleteBudgetTransaction(supabase, userId, id);
}

export async function reimburseTransactionWithLedger(
  supabase: SupabaseClient,
  userId: string,
  input: {
    recordType: TransactionRecordType;
    id: string;
    amount: number;
    financialAccountId?: string;
    note?: string;
  }
): Promise<{ recordType: "savings" | "budget"; item: unknown }> {
  const { recordType, id, amount } = input;
  if (!(amount > 0)) throw new Error("Valid amount required");

  let defaultFinancialAccountId: string | null = null;
  let category = "Reimbursement";
  let sourceMeta: {
    id: string;
    amount: number;
    note: string;
    whenIso: string;
  } | null = null;

  if (recordType === "expense") {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Not found");
    const exp = mapExpense(data);
    defaultFinancialAccountId = exp.financialAccountId ?? null;
    category = exp.category || "Expense";
    const spentAt = String(exp.spentAt ?? "").slice(0, 10);
    sourceMeta = {
      id: exp.id,
      amount: exp.amount,
      note: exp.note ?? "",
      whenIso: spentAt
        ? sgtSpentAtToIso(spentAt, exp.spentTime ?? "00:00:00")
        : exp.createdAt,
    };
  } else if (recordType === "budget") {
    const tx = await getBudgetTransactionById(supabase, userId, id);
    if (!tx) throw new Error("Not found");
    defaultFinancialAccountId = tx.financialAccountId;
    category = tx.category || "Budget";
    sourceMeta = {
      id: tx.id,
      amount: tx.amount,
      note: tx.note ?? "",
      whenIso: sgtSpentAtToIso(tx.spentAt, tx.spentTime ?? "00:00:00"),
    };
  } else {
    const data = await getSavingsTransactionById(supabase, userId, id);
    if (!data) throw new Error("Not found");
    if (data.accountId) {
      const { data: fa, error: faErr } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("savings_account_id", data.accountId)
        .maybeSingle();
      if (faErr) throw new Error(faErr.message);
      defaultFinancialAccountId = fa?.id ? String(fa.id) : null;
    }
    sourceMeta = {
      id,
      amount: Math.abs(data.amount),
      note: data.note ?? "",
      whenIso: data.occurredAt,
    };
  }

  const financialAccountId = input.financialAccountId ?? defaultFinancialAccountId;
  if (!financialAccountId) throw new Error("No target account available");

  const account = await loadFinancialAccount(supabase, userId, financialAccountId);
  if (!account) throw new Error("Invalid account");

  if (recordType === "expense" || recordType === "budget") {
    await applyReimbursementBudgetImpact(supabase, userId, recordType, id, amount);
  }

  const nowIso = new Date().toISOString();
  const note =
    typeof input.note === "string" && input.note.trim()
      ? input.note.trim()
      : sourceMeta
        ? formatReimbursementNote(sourceMeta)
        : "Reimbursement";

  let result: { recordType: "savings" | "budget"; item: unknown };

  if (account.accountType === "cash" && account.savingsAccountId) {
    const row = await applyTransaction(supabase, {
      userId,
      accountId: account.savingsAccountId,
      amount,
      kind: "deposit",
      occurredAt: nowIso,
      note,
      sourceRecordType: recordType,
      sourceRecordId: id,
    });
    result = { recordType: "savings", item: row };
  } else {
    const row = await createBudgetTransaction(supabase, userId, {
      financialAccountId: account.id,
      ledger: account.name,
      category,
      amount,
      spentAt: sgtTodayYmd(),
      spentTime: sgtNowTimeHms(),
      note,
      transactionType: "income",
      sourceRecordType: recordType,
      sourceRecordId: id,
    });
    result = { recordType: "budget", item: row };
  }

  console.info("[tx-actions] reimbursement complete", {
    recordType,
    id,
    amount,
    ledgerRecordType: result.recordType,
  });

  return result;
}
