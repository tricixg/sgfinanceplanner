import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { applyTransaction } from "@/lib/savings/ledger";
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
  const { data: row, error } = await supabase
    .from("other_loans")
    .select("id, outstanding, amount_paid")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Loan not found" };

  const nextOutstanding = roundMoney(Number(row.outstanding ?? 0) + amount);
  const nextPaid = roundMoney(Math.max(0, Number(row.amount_paid ?? 0) - amount));

  const { error: updErr } = await supabase
    .from("other_loans")
    .update({
      outstanding: nextOutstanding,
      amount_paid: nextPaid,
      paid_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId)
    .eq("user_id", userId);

  if (updErr) return { ok: false, error: updErr.message };

  console.info("[other-loans] payment restored (expense deleted)", {
    loanId,
    amount,
    nextOutstanding,
  });
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
  const { data: row, error } = await supabase
    .from("other_loans")
    .select("id, outstanding, principal")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!row) return { ok: false, error: "Loan not found" };

  const nextOutstanding = roundMoney(Math.max(0, Number(row.outstanding ?? 0) - amount));
  const nextPrincipal = roundMoney(Math.max(0, Number(row.principal ?? 0) - amount));

  const { error: updErr } = await supabase
    .from("other_loans")
    .update({
      outstanding: nextOutstanding,
      principal: nextPrincipal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId)
    .eq("user_id", userId);

  if (updErr) return { ok: false, error: updErr.message };

  console.info("[other-loans] draw-down restored (transaction deleted)", {
    loanId,
    amount,
    nextOutstanding,
  });
  return { ok: true };
}

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

  const { data: row, error } = await supabase
    .from("other_loans")
    .select("*")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Loan not found");
  if (String(row.loan_type) === "balance_transfer") {
    throw new Error("Balance transfer is paid from Credit Cards statement payment");
  }

  const outstanding = Number(row.outstanding ?? 0);
  if (amount > outstanding + 0.01) {
    throw new Error(`Payment exceeds outstanding (${outstanding})`);
  }

  const now = new Date();
  const occurredAt = now.toISOString();

  const txNote = note?.trim()
    ? `${otherLoanPaymentNote({ name: String(row.name) })} — ${note.trim()}`
    : otherLoanPaymentNote({ name: String(row.name) });

  // Mirrors the instalment-loan auto-payment expense (auto_category: "debt")
  // so personal loan payments count as spend under the Debts & Loans budget category.
  const { data: expenseRow, error: expenseErr } = await supabase
    .from("expenses")
    .insert({
      user_id: userId,
      amount,
      category: COMPUTED_DEBT_LABEL,
      auto_category: "debt",
      other_loan_id: loanId,
      spent_at: sgtTodayYmd(now),
      spent_time: sgtNowTimeHms(now),
      note: txNote,
      financial_account_id: financialAccountId ?? null,
      entry_source: "manual",
    })
    .select("id")
    .single();
  if (expenseErr) throw new Error(expenseErr.message);
  const expenseId = String(expenseRow.id);

  try {
    if (financialAccountId) {
      const account = await loadFinancialAccount(supabase, userId, financialAccountId);
      if (!account?.savingsAccountId || account.accountType !== "cash") {
        throw new Error("Payment must come from a cash account");
      }

      await applyTransaction(supabase, {
        userId,
        accountId: account.savingsAccountId,
        amount: -amount,
        kind: "withdrawal",
        occurredAt,
        note: txNote,
        expenseId,
        sourceRecordType: "other_loan",
        sourceRecordId: loanId,
      });
    } else {
      // No account selected — record in payment history without touching any balance.
      // Requires migration 037 (savings_transactions_one_target constraint relaxed).
      const { error: insErr } = await supabase
        .from("savings_transactions")
        .insert({
          user_id: userId,
          account_id: null,
          pool_id: null,
          kind: "withdrawal",
          amount: -amount,
          balance_after: 0,
          note: txNote,
          occurred_at: occurredAt,
          expense_id: expenseId,
          source_record_type: "other_loan",
          source_record_id: loanId,
        });
      if (insErr) throw new Error(insErr.message);
    }
  } catch (err) {
    await supabase.from("expenses").delete().eq("id", expenseId).eq("user_id", userId);
    throw err;
  }

  const newPaid = roundMoney(Number(row.amount_paid ?? 0) + amount);
  const newOutstanding = roundMoney(outstanding - amount);
  const fullyPaid = newOutstanding <= 0;

  const { error: updErr } = await supabase
    .from("other_loans")
    .update({
      amount_paid: newPaid,
      outstanding: newOutstanding,
      paid_at: fullyPaid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);

  console.info("[other-loans] payment recorded", {
    loanId,
    amount,
    newOutstanding,
    fullyPaid,
    expenseId,
  });

  const { loadOtherLoans } = await import("./load");
  return (await loadOtherLoans(supabase, userId)).find((l) => l.id === loanId)!;
}

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

  const { data: row, error } = await supabase
    .from("other_loans")
    .select("*")
    .eq("id", loanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Loan not found");
  if (String(row.loan_type) === "balance_transfer") {
    throw new Error("Balance transfers cannot be topped up this way");
  }

  const occurredAt = new Date().toISOString();
  const txNote = note?.trim()
    ? `${otherLoanDrawDownNote({ name: String(row.name) })} — ${note.trim()}`
    : otherLoanDrawDownNote({ name: String(row.name) });

  if (financialAccountId) {
    const account = await loadFinancialAccount(supabase, userId, financialAccountId);
    if (!account?.savingsAccountId || account.accountType !== "cash") {
      throw new Error("Account must be a cash account");
    }

    await applyTransaction(supabase, {
      userId,
      accountId: account.savingsAccountId,
      amount: +amount,
      kind: "deposit",
      occurredAt,
      note: txNote,
      sourceRecordType: "other_loan",
      sourceRecordId: loanId,
    });
  } else {
    const { error: insErr } = await supabase
      .from("savings_transactions")
      .insert({
        user_id: userId,
        account_id: null,
        pool_id: null,
        kind: "deposit",
        amount: +amount,
        balance_after: 0,
        note: txNote,
        occurred_at: occurredAt,
        source_record_type: "other_loan",
        source_record_id: loanId,
      });
    if (insErr) throw new Error(insErr.message);
  }

  const newOutstanding = roundMoney(Number(row.outstanding ?? 0) + amount);
  const newPrincipal = roundMoney(Number(row.principal ?? 0) + amount);

  const { error: updErr } = await supabase
    .from("other_loans")
    .update({
      outstanding: newOutstanding,
      principal: newPrincipal,
      paid_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", loanId);

  if (updErr) throw new Error(updErr.message);

  console.info("[other-loans] draw-down recorded", {
    loanId,
    amount,
    newOutstanding,
  });

  const { loadOtherLoans } = await import("./load");
  return (await loadOtherLoans(supabase, userId)).find((l) => l.id === loanId)!;
}
