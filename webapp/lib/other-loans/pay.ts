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
  financialAccountId: string
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

  const outstanding = Number(row.outstanding ?? 0);
  if (amount > outstanding + 0.01) {
    throw new Error(`Payment exceeds outstanding (${outstanding})`);
  }

  const account = await loadFinancialAccount(supabase, userId, financialAccountId);
  if (!account?.savingsAccountId || account.accountType !== "cash") {
    throw new Error("Payment must come from a cash account");
  }

  await applyTransaction(supabase, {
    userId,
    accountId: account.savingsAccountId,
    amount: -amount,
    kind: "withdrawal",
    occurredAt: new Date().toISOString(),
    note: otherLoanPaymentNote({ name: String(row.name) }),
  });

  const newPaid = roundMoney(Number(row.amount_paid ?? 0) + amount);
  const newOutstanding = roundMoney(outstanding - amount);
  const fullyPaid = newOutstanding <= 0;

  const { data: updated, error: updErr } = await supabase
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
