import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import { outstandingBalance, roundMoney } from "@/lib/cards/interest-accrual";
import { applyTransaction } from "@/lib/savings/ledger";
import { mapCardStatement, type DbCardStatement } from "./mappers";
import { recomputeInterestForStatement } from "./interest";

export function cardPaymentNote(cardName: string, closeDate: string): string {
  return `Card payment: ${cardName} (${closeDate})`;
}

export async function recordCardStatementPayment(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  statementId: string,
  amount: number,
  financialAccountId: string
): Promise<DbCardStatement> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be positive");
  }

  const { data: row, error } = await supabase
    .from("card_statements")
    .select("*")
    .eq("id", statementId)
    .eq("user_id", userId)
    .eq("credit_card_id", card.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Statement not found");

  const stmt = mapCardStatement(row);
  const interest = await recomputeInterestForStatement(supabase, userId, card, stmt);
  const outstanding = outstandingBalance({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: stmt.amountPaid,
  });

  if (amount > outstanding + 0.01) {
    throw new Error(`Payment exceeds outstanding balance (${outstanding})`);
  }

  const account = await loadFinancialAccount(supabase, userId, financialAccountId);
  if (!account?.savingsAccountId || account.accountType !== "cash") {
    throw new Error("Payment must come from a cash account");
  }

  const tx = await applyTransaction(supabase, {
    userId,
    accountId: account.savingsAccountId,
    amount: -amount,
    kind: "withdrawal",
    occurredAt: new Date().toISOString(),
    note: cardPaymentNote(card.name, stmt.statementCloseDate),
  });

  const newPaid = roundMoney(stmt.amountPaid + amount);
  const newOutstanding = outstandingBalance({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: newPaid,
  });
  const fullyPaid = newOutstanding <= 0;

  const { data: updated, error: updErr } = await supabase
    .from("card_statements")
    .update({
      amount_paid: newPaid,
      paid_at: fullyPaid ? new Date().toISOString() : null,
      interest_accrued: fullyPaid ? 0 : interest,
      payment_financial_account_id: financialAccountId,
      payment_savings_transaction_id: tx.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", statementId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);

  console.info("[card-statements] payment recorded", {
    statementId,
    amount,
    newPaid,
    fullyPaid,
    txId: tx.id,
  });

  return mapCardStatement(updated);
}
