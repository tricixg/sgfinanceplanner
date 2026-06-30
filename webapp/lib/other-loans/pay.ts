import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { applyTransaction } from "@/lib/savings/ledger";
import type { OtherLoan } from "./types";

export function otherLoanPaymentNote(loan: Pick<OtherLoan, "name">): string {
  return `Loan payment: ${loan.name}`;
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

  const occurredAt = new Date().toISOString();

  const txNote = note?.trim()
    ? `${otherLoanPaymentNote({ name: String(row.name) })} — ${note.trim()}`
    : otherLoanPaymentNote({ name: String(row.name) });

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
        source_record_type: "other_loan",
        source_record_id: loanId,
      });
    if (insErr) throw new Error(insErr.message);
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
  });

  const { loadOtherLoans } = await import("./load");
  return (await loadOtherLoans(supabase, userId)).find((l) => l.id === loanId)!;
}
