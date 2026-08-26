import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { applyTransaction } from "@/lib/savings/ledger";
import type { Expense } from "@/lib/savings/types";
import { sgtSpentAtToIso } from "@/lib/time/sgt";

export function expenseLedgerNote(expense: Expense): string {
  if (expense.note.trim()) return expense.note.trim();
  return expense.category || "Expense";
}

export function expenseBudgetTransactionType(
  expense: Expense
): "expense" | "subscription" {
  return expense.autoCategory === "subscription" ? "subscription" : "expense";
}

function expenseOccurredAt(expense: Expense): string {
  if (expense.spentTime) {
    return sgtSpentAtToIso(expense.spentAt, expense.spentTime);
  }
  return sgtSpentAtToIso(expense.spentAt, "00:00:00");
}

export async function createExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense,
  opts: { occurredAt?: string } = {}
): Promise<void> {
  if (!expense.financialAccountId) {
    console.info("[ledger-sync] skip — no pay-from account", { expenseId: expense.id });
    return;
  }

  const account = await loadFinancialAccount(supabase, userId, expense.financialAccountId);
  if (!account) {
    throw new Error("Invalid financial account");
  }

  const note = expenseLedgerNote(expense);
  const occurredAt = opts.occurredAt ?? expenseOccurredAt(expense);
  const spentTime = occurredAt.slice(11, 19);

  if (account.accountType === "cash" && account.savingsAccountId) {
    await applyTransaction(supabase, {
      userId,
      accountId: account.savingsAccountId,
      amount: -expense.amount,
      kind: "withdrawal",
      occurredAt,
      note,
      expenseId: expense.id,
    });
    console.info("[ledger-sync] savings withdrawal created", {
      expenseId: expense.id,
      accountId: account.savingsAccountId,
      amount: expense.amount,
    });
    return;
  }

  if (account.accountType === "credit_card") {
    const { error } = await supabase.from("budget_transactions").insert({
      user_id: userId,
      financial_account_id: expense.financialAccountId,
      ledger: account.name,
      category: expense.category,
      subcategory: "",
      currency: "SGD",
      amount: expense.amount,
      recorder: "",
      spent_at: expense.spentAt,
      spent_time: spentTime,
      tag: "",
      note,
      transaction_type: expenseBudgetTransactionType(expense),
      import_batch_id: null,
      expense_id: expense.id,
    });

    if (error) {
      throw new Error(error.message);
    }

    console.info("[ledger-sync] budget transaction created", {
      expenseId: expense.id,
      financialAccountId: expense.financialAccountId,
      amount: expense.amount,
    });
    return;
  }

  console.info("[ledger-sync] skip — cash account without savings link", {
    expenseId: expense.id,
    financialAccountId: expense.financialAccountId,
  });
}

export async function reverseExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense
): Promise<void> {
  const { data: savingsRows, error: savingsErr } = await supabase
    .from("savings_transactions")
    .select("id, account_id, amount")
    .eq("expense_id", expense.id)
    .eq("user_id", userId);

  if (savingsErr) {
    throw new Error(savingsErr.message);
  }

  for (const row of savingsRows ?? []) {
    const accountId = row.account_id ? String(row.account_id) : null;
    const withdrawalAmount = Number(row.amount ?? 0);
    const restoreAmount = -withdrawalAmount;

    if (accountId && restoreAmount !== 0) {
      const { data: acct, error: acctErr } = await supabase
        .from("user_savings_accounts")
        .select("balance")
        .eq("id", accountId)
        .maybeSingle();
      if (acctErr || !acct) {
        throw new Error(acctErr?.message ?? "Account not found");
      }
      const nextBalance = Number(acct.balance ?? 0) + restoreAmount;
      if (nextBalance < 0) {
        throw new Error("Insufficient balance for reversal");
      }
      const { error: updErr } = await supabase
        .from("user_savings_accounts")
        .update({ balance: nextBalance, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      if (updErr) throw new Error(updErr.message);
    }

    // Always remove the linked row, even when it had no account (record-only
    // entries) — otherwise it dangles with a stale expense_id after the
    // expense is deleted and keeps showing up in history views.
    const { error: delErr } = await supabase
      .from("savings_transactions")
      .delete()
      .eq("id", row.id)
      .eq("user_id", userId);

    if (delErr) {
      throw new Error(delErr.message);
    }

    console.info("[ledger-sync] savings reversal balance restored", {
      expenseId: expense.id,
      accountId,
      amount: restoreAmount,
      removedTxId: row.id,
    });
  }

  const { error: budgetDelErr } = await supabase
    .from("budget_transactions")
    .delete()
    .eq("expense_id", expense.id)
    .eq("user_id", userId);

  if (budgetDelErr) {
    throw new Error(budgetDelErr.message);
  }

  if ((savingsRows?.length ?? 0) > 0 || expense.financialAccountId) {
    console.info("[ledger-sync] ledger reversed", {
      expenseId: expense.id,
      savingsRows: savingsRows?.length ?? 0,
    });
  }
}
