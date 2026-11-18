import type { SupabaseClient } from "@supabase/supabase-js";
import type { Expense } from "@/lib/savings/types";
import { mapExpense } from "@/lib/savings/db-mappers";
import { callLedgerRpc } from "@/lib/supabase/rpc";
import type { ExpenseLedgerPlan } from "@/lib/expenses/ledger-sync";

/** Migration that adds the expense create/delete functions used below. */
export const EXPENSE_LEDGER_MIGRATION = "073_expense_ledger_functions.sql";

export type CreateExpenseWithLedgerInput = {
  /** expenses columns, as they would be sent to `.insert()`. */
  row: Record<string, unknown>;
  /** Instalment loan paid by this expense: outstanding -= amount. */
  loanId?: string | null;
  /** BNPL plan paid by this expense: months_paid += 1. */
  bnplId?: string | null;
  /** Fund that receives this expense's amount as a deposit. */
  fund?: { fundId: string; note: string } | null;
  /** Cash withdrawal or card ledger row (see planExpenseLedger). */
  ledger?: ExpenseLedgerPlan | null;
  /** Idempotency key; a retry returns the first expense and writes nothing. */
  clientRequestId?: string | null;
};

/**
 * Inserts an expense and applies all of its ledger effects (loan, BNPL,
 * fund, cash withdrawal / card ledger row) in one database transaction.
 * Any failure ("Insufficient balance", "Loan not found", …) leaves nothing
 * behind.
 */
export async function createExpenseWithLedger(
  supabase: SupabaseClient,
  userId: string,
  input: CreateExpenseWithLedgerInput
): Promise<{ expense: Expense; replayed: boolean }> {
  const result = await callLedgerRpc<{ expense: Record<string, unknown>; replayed: boolean }>(
    supabase,
    "expense_create_with_ledger",
    {
      p_user_id: userId,
      p_expense: input.row,
      p_loan_id: input.loanId ?? null,
      p_bnpl_id: input.bnplId ?? null,
      p_fund: input.fund ? { fund_id: input.fund.fundId, note: input.fund.note } : null,
      p_ledger: input.ledger ?? null,
      p_client_request_id: input.clientRequestId ?? null,
    },
    EXPENSE_LEDGER_MIGRATION
  );
  return { expense: mapExpense(result.expense), replayed: result.replayed };
}

/** Start of the message the database raises when an expense delete is refused. */
export const EXPENSE_DELETE_BLOCKED_PREFIX = "Can't delete this payment:";

/** True for the "Can't delete this payment: …" refusals from expense_delete_with_ledger. */
export function isExpenseDeleteBlocked(message: string): boolean {
  return message.startsWith(EXPENSE_DELETE_BLOCKED_PREFIX);
}

/**
 * Reverses an expense's ledger entries, deletes it, and restores what it paid
 * (loan / personal loan outstanding, BNPL months, fund deposit) — one database
 * transaction. If any of that can't be done (e.g. the fund no longer holds
 * enough to reverse a recurring-invest payment) the delete is refused with a
 * "Can't delete this payment: …" message and nothing changes (migration 076).
 * Returns null when the expense doesn't exist.
 */
export async function deleteExpenseWithLedger(
  supabase: SupabaseClient,
  userId: string,
  expenseId: string
): Promise<{ expense: Record<string, unknown> } | null> {
  const result = await callLedgerRpc<{ expense: Record<string, unknown> } | null>(
    supabase,
    "expense_delete_with_ledger",
    {
      p_user_id: userId,
      p_expense_id: expenseId,
      p_restore_bnpl: true,
      p_reverse_fund: true,
    },
    // The function exists since 073; 076 replaced it with the refusing version.
    EXPENSE_LEDGER_MIGRATION
  );
  if (!result) return null;
  return { expense: result.expense };
}
