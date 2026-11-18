import type { SupabaseClient } from "@supabase/supabase-js";
import { LOAN_LEDGER_MIGRATION, loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { callLedgerRpc } from "@/lib/supabase/rpc";
import { COMPUTED_DEBT_LABEL } from "@/lib/finance/budget";
import { sgtNowTimeHms, sgtTodayYmd } from "@/lib/time/sgt";
import type { OtherLoan } from "./types";

export function otherLoanPaymentNote(loan: Pick<OtherLoan, "name">): string {
  return `Loan payment: ${loan.name}`;
}

export function otherLoanDrawDownNote(loan: Pick<OtherLoan, "name">): string {
  return `Loan draw-down: ${loan.name}`;
}

/** Undo the outstanding/amount_paid bookkeeping from recordOtherLoanPayment — used when
 *  the linked "debt" expense is deleted from the unified transactions list. */
export async function restoreOtherLoanPayment(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  amount: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callLedgerRpc(
      supabase,
      "other_loan_restore_payment",
      { p_user_id: userId, p_loan_id: loanId, p_amount: amount },
      LOAN_LEDGER_MIGRATION
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  console.info("[other-loans] payment restored (expense deleted)", { loanId });
  return { ok: true };
}

/** Undo the outstanding/principal bookkeeping from addToOtherLoan — used when
 *  a linked draw-down savings_transactions row is deleted from the history. */
export async function restoreOtherLoanDrawDown(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  amount: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callLedgerRpc(
      supabase,
      "other_loan_restore_draw_down",
      { p_user_id: userId, p_loan_id: loanId, p_amount: amount },
      LOAN_LEDGER_MIGRATION
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  console.info("[other-loans] draw-down restored (transaction deleted)", { loanId });
  return { ok: true };
}

async function loadOtherLoanForWrite(
  supabase: SupabaseClient,
  userId: string,
  loanId: string
): Promise<Record<string, unknown>> {
  const { data: row, error } = await supabase
    .from("other_loans")
    .select("*")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Loan not found");
  return row;
}

/**
 * Records a payment: the "debt" expense, the cash withdrawal (or a
 * record-only history row when no account is chosen) and the loan's
 * amount_paid / outstanding — all in one database transaction.
 */
export async function recordOtherLoanPayment(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  amount: number,
  financialAccountId?: string,
  note?: string
): Promise<OtherLoan> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be positive");
  }

  // Read for the note text and early, friendly validation; the database
  // function re-checks type and outstanding under a row lock.
  const row = await loadOtherLoanForWrite(supabase, userId, loanId);
  if (String(row.loan_type) === "balance_transfer") {
    throw new Error("Balance transfer is paid from Credit Cards statement payment");
  }
  const outstanding = Number(row.outstanding ?? 0);
  if (amount > outstanding + 0.01) {
    throw new Error(`Payment exceeds outstanding (${outstanding})`);
  }

  let savingsAccountId: string | null = null;
  if (financialAccountId) {
    const account = await loadFinancialAccount(supabase, userId, financialAccountId);
    if (!account?.savingsAccountId || account.accountType !== "cash") {
      throw new Error("Payment must come from a cash account");
    }
    savingsAccountId = account.savingsAccountId;
  }

  const now = new Date();
  const txNote = note?.trim()
    ? `${otherLoanPaymentNote({ name: String(row.name) })} — ${note.trim()}`
    : otherLoanPaymentNote({ name: String(row.name) });

  // Mirrors the instalment-loan auto-payment expense (auto_category: "debt")
  // so personal loan payments count as spend under the Debts & Loans budget category.
  const expenseId = await callLedgerRpc<string>(
    supabase,
    "other_loan_record_payment",
    {
      p_user_id: userId,
      p_loan_id: loanId,
      p_amount: amount,
      p_savings_account_id: savingsAccountId,
      p_financial_account_id: financialAccountId ?? null,
      p_category: COMPUTED_DEBT_LABEL,
      p_spent_at: sgtTodayYmd(now),
      p_spent_time: sgtNowTimeHms(now),
      p_occurred_at: now.toISOString(),
      p_note: txNote,
    },
    LOAN_LEDGER_MIGRATION
  );

  console.info("[other-loans] payment recorded", {
    loanId,
    fullyPaid: roundMoney(outstanding - amount) <= 0,
    expenseId,
  });

  const { loadOtherLoans } = await import("./load");
  return (await loadOtherLoans(supabase, userId)).find((l) => l.id === loanId)!;
}

/** Draw-down: cash deposit (or record-only row) and loan outstanding/principal, atomically. */
export async function addToOtherLoan(
  supabase: SupabaseClient,
  userId: string,
  loanId: string,
  amount: number,
  financialAccountId?: string,
  note?: string
): Promise<OtherLoan> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const row = await loadOtherLoanForWrite(supabase, userId, loanId);
  if (String(row.loan_type) === "balance_transfer") {
    throw new Error("Balance transfers cannot be topped up this way");
  }

  let savingsAccountId: string | null = null;
  if (financialAccountId) {
    const account = await loadFinancialAccount(supabase, userId, financialAccountId);
    if (!account?.savingsAccountId || account.accountType !== "cash") {
      throw new Error("Account must be a cash account");
    }
    savingsAccountId = account.savingsAccountId;
  }

  const txNote = note?.trim()
    ? `${otherLoanDrawDownNote({ name: String(row.name) })} — ${note.trim()}`
    : otherLoanDrawDownNote({ name: String(row.name) });

  await callLedgerRpc(
    supabase,
    "other_loan_add_draw_down",
    {
      p_user_id: userId,
      p_loan_id: loanId,
      p_amount: amount,
      p_savings_account_id: savingsAccountId,
      p_occurred_at: new Date().toISOString(),
      p_note: txNote,
    },
    LOAN_LEDGER_MIGRATION
  );

  console.info("[other-loans] draw-down recorded", { loanId });

  const { loadOtherLoans } = await import("./load");
  return (await loadOtherLoans(supabase, userId)).find((l) => l.id === loanId)!;
}
