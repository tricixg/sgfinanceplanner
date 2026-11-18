import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { applyTransaction, SAVINGS_LEDGER_MIGRATION } from "@/lib/savings/ledger";
import { callLedgerRpc } from "@/lib/supabase/rpc";
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

/** What an expense writes to the money ledgers, decided before anything is written. */
export type ExpenseLedgerPlan =
  | { type: "savings"; account_id: string; occurred_at: string; note: string }
  | { type: "budget"; row: Record<string, unknown> };

/** The expense fields the ledger plan depends on. */
export type ExpenseLedgerDraft = Pick<
  Expense,
  "id" | "financialAccountId" | "amount" | "note" | "category" | "autoCategory" | "spentAt" | "spentTime"
>;

/**
 * Resolves the pay-from account and returns the ledger write for this
 * expense (cash withdrawal, card ledger row, or nothing). Reads only.
 * Throws "Invalid financial account" when the account doesn't exist.
 */
export async function planExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expense: ExpenseLedgerDraft,
  opts: { occurredAt?: string } = {}
): Promise<ExpenseLedgerPlan | null> {
  if (!expense.financialAccountId) {
    console.info("[ledger-sync] skip — no pay-from account", { expenseId: expense.id });
    return null;
  }

  const account = await loadFinancialAccount(supabase, userId, expense.financialAccountId);
  if (!account) {
    throw new Error("Invalid financial account");
  }

  const note = expenseLedgerNote(expense as Expense);
  const occurredAt = opts.occurredAt ?? expenseOccurredAt(expense as Expense);
  const spentTime = occurredAt.slice(11, 19);

  if (account.accountType === "cash" && account.savingsAccountId) {
    return { type: "savings", account_id: account.savingsAccountId, occurred_at: occurredAt, note };
  }

  if (account.accountType === "credit_card") {
    return {
      type: "budget",
      row: {
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
        transaction_type: expenseBudgetTransactionType(expense as Expense),
        import_batch_id: null,
      },
    };
  }

  console.info("[ledger-sync] skip — cash account without savings link", {
    expenseId: expense.id,
    financialAccountId: expense.financialAccountId,
  });
  return null;
}

/** Writes the ledger entry for an expense that already exists. */
export async function createExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense,
  opts: { occurredAt?: string } = {}
): Promise<void> {
  const plan = await planExpenseLedger(supabase, userId, expense, opts);
  if (!plan) return;

  if (plan.type === "savings") {
    // Atomic balance change + ledger row (ledger_apply_savings_transaction).
    await applyTransaction(supabase, {
      userId,
      accountId: plan.account_id,
      amount: -expense.amount,
      kind: "withdrawal",
      occurredAt: plan.occurred_at,
      note: plan.note,
      expenseId: expense.id,
    });
    console.info("[ledger-sync] savings withdrawal created", {
      expenseId: expense.id,
      accountId: plan.account_id,
    });
    return;
  }

  const { error } = await supabase
    .from("budget_transactions")
    .insert({ ...plan.row, expense_id: expense.id });
  if (error) {
    throw new Error(error.message);
  }
  console.info("[ledger-sync] budget transaction created", {
    expenseId: expense.id,
    financialAccountId: expense.financialAccountId,
  });
}

export async function reverseExpenseLedger(
  supabase: SupabaseClient,
  userId: string,
  expense: Expense
): Promise<void> {
  // One database transaction: restore each linked cash withdrawal, remove the
  // linked savings rows (record-only ones too, so none dangle with a stale
  // expense_id) and the linked card ledger rows. Throws "Insufficient balance
  // for reversal" without changing anything if a restore would go negative.
  const removed = await callLedgerRpc<number>(
    supabase,
    "ledger_reverse_expense",
    { p_user_id: userId, p_expense_id: expense.id },
    SAVINGS_LEDGER_MIGRATION
  );

  if ((removed ?? 0) > 0 || expense.financialAccountId) {
    console.info("[ledger-sync] ledger reversed", {
      expenseId: expense.id,
      savingsRows: removed ?? 0,
    });
  }
}
