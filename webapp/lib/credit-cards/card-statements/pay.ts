import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { loadCreditCards } from "@/lib/credit-cards/load";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import { outstandingBalance, roundMoney } from "@/lib/cards/interest-accrual";
import { applyTransaction } from "@/lib/savings/ledger";
import {
  deleteSavingsTransaction,
  getSavingsTransactionById,
} from "@/lib/savings/ledger";
import { mapCardStatement, type DbCardStatement } from "./mappers";
import { recomputeInterestForStatement } from "./interest";

export function cardPaymentNote(cardName: string, closeDate: string): string {
  return `Card payment: ${cardName} (${closeDate})`;
}

type BtRow = {
  id: string;
  outstanding: number;
  amountPaid: number;
  paidAt: string | null;
};

function mapBtRows(
  data: Array<{
    id: string;
    outstanding: number | null;
    amount_paid: number | null;
    paid_at: string | null;
  }>
): BtRow[] {
  return data.map((r) => ({
    id: String(r.id),
    outstanding: Number(r.outstanding ?? 0),
    amountPaid: Number(r.amount_paid ?? 0),
    paidAt: r.paid_at ? String(r.paid_at) : null,
  }));
}

async function loadActiveBtRows(
  supabase: SupabaseClient,
  userId: string,
  creditCardId: string
): Promise<BtRow[]> {
  const { data, error } = await supabase
    .from("other_loans")
    .select("id, outstanding, amount_paid, paid_at")
    .eq("user_id", userId)
    .eq("loan_type", "balance_transfer")
    .eq("source_credit_card_id", creditCardId)
    .is("paid_at", null)
    .gt("outstanding", 0)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return mapBtRows(data ?? []);
}

/** All BT loans on a card (for undo reversal, including recently paid-off). */
async function loadBtRowsForUndo(
  supabase: SupabaseClient,
  userId: string,
  creditCardId: string
): Promise<BtRow[]> {
  const { data, error } = await supabase
    .from("other_loans")
    .select("id, outstanding, amount_paid, paid_at")
    .eq("user_id", userId)
    .eq("loan_type", "balance_transfer")
    .eq("source_credit_card_id", creditCardId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return mapBtRows(data ?? []);
}

/** Split payment between statement (non-BT) and balance-transfer loans — mirrors recordCardStatementPayment. */
export function splitCardPaymentAmount(
  amount: number,
  statementOutstanding: number,
  btOutstanding: number
): { payToNonBt: number; btPayment: number } {
  const btWithinStatement = Math.min(btOutstanding, statementOutstanding);
  const nonBtOutstanding = roundMoney(Math.max(0, statementOutstanding - btWithinStatement));
  const payToNonBt = Math.min(amount, nonBtOutstanding);
  const btPayment = roundMoney(
    Math.min(Math.max(0, amount - payToNonBt), btWithinStatement)
  );
  return { payToNonBt, btPayment };
}

/** Infer BT portion of a payment being undone (fixed-point on pre-payment BT outstanding). */
export function inferBtPaymentForUndo(
  paymentAmount: number,
  statementOutstandingBefore: number,
  btOutstandingNow: number
): number {
  let btOutstandingBefore = btOutstandingNow;
  for (let i = 0; i < 16; i++) {
    const { btPayment } = splitCardPaymentAmount(
      paymentAmount,
      statementOutstandingBefore,
      btOutstandingBefore
    );
    const nextBefore = roundMoney(btOutstandingNow + btPayment);
    if (Math.abs(nextBefore - btOutstandingBefore) < 0.01) {
      return btPayment;
    }
    btOutstandingBefore = nextBefore;
  }
  return splitCardPaymentAmount(
    paymentAmount,
    statementOutstandingBefore,
    btOutstandingNow
  ).btPayment;
}

async function applyBtPaymentAllocation(
  supabase: SupabaseClient,
  userId: string,
  btRows: BtRow[],
  btPayment: number
): Promise<void> {
  let btRemaining = btPayment;
  if (btRemaining <= 0) return;

  for (const bt of btRows) {
    if (btRemaining <= 0) break;
    const apply = Math.min(btRemaining, bt.outstanding);
    if (apply <= 0) continue;
    const nextOutstanding = roundMoney(Math.max(0, bt.outstanding - apply));
    const nextPaid = roundMoney(bt.amountPaid + apply);
    const btPaid = nextOutstanding <= 0;
    const { error: btErr } = await supabase
      .from("other_loans")
      .update({
        outstanding: nextOutstanding,
        amount_paid: nextPaid,
        paid_at: btPaid ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bt.id)
      .eq("user_id", userId);
    if (btErr) throw new Error(btErr.message);
    btRemaining = roundMoney(btRemaining - apply);
  }
}

/** Reverse BT allocation in opposite order of applyBtPaymentAllocation. */
async function reverseBtPaymentAllocation(
  supabase: SupabaseClient,
  userId: string,
  btRows: BtRow[],
  btPayment: number
): Promise<void> {
  let remaining = btPayment;
  if (remaining <= 0) return;

  for (const bt of [...btRows].reverse()) {
    if (remaining <= 0) break;
    const restore = Math.min(remaining, bt.amountPaid);
    if (restore <= 0) continue;
    const nextOutstanding = roundMoney(bt.outstanding + restore);
    const nextPaid = roundMoney(Math.max(0, bt.amountPaid - restore));
    const { error: btErr } = await supabase
      .from("other_loans")
      .update({
        outstanding: nextOutstanding,
        amount_paid: nextPaid,
        paid_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bt.id)
      .eq("user_id", userId);
    if (btErr) throw new Error(btErr.message);
    remaining = roundMoney(remaining - restore);
  }

  if (remaining > 0.01) {
    console.warn("[card-statements] BT undo left unallocated remainder", { remaining });
  }
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

  const btRows = await loadActiveBtRows(supabase, userId, card.id);
  const btOutstanding = btRows.reduce((sum, r) => sum + Math.max(0, r.outstanding), 0);
  const maxPayable = roundMoney(outstanding);

  if (amount > maxPayable + 0.01) {
    throw new Error(`Payment exceeds outstanding balance (${maxPayable})`);
  }

  const account = await loadFinancialAccount(supabase, userId, financialAccountId);
  if (!account?.savingsAccountId || account.accountType !== "cash") {
    throw new Error("Payment must come from a cash account");
  }

  const { data: savingsRow, error: savingsErr } = await supabase
    .from("user_savings_accounts")
    .select("balance")
    .eq("id", account.savingsAccountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (savingsErr) throw new Error(savingsErr.message);
  if (!savingsRow) throw new Error("Cash account not found");

  const cashAvailable = roundMoney(Number(savingsRow.balance ?? 0));
  if (amount > cashAvailable + 0.01) {
    throw new Error(
      `Insufficient balance in ${account.name}. Available ${cashAvailable.toFixed(2)}, payment ${roundMoney(amount).toFixed(2)}.`
    );
  }

  const tx = await applyTransaction(supabase, {
    userId,
    accountId: account.savingsAccountId,
    amount: -amount,
    kind: "withdrawal",
    occurredAt: new Date().toISOString(),
    note: cardPaymentNote(card.name, stmt.statementCloseDate),
  });

  const { payToNonBt, btPayment } = splitCardPaymentAmount(amount, outstanding, btOutstanding);
  const payToStatement = amount;
  const newPaid = roundMoney(stmt.amountPaid + payToStatement);
  const newOutstanding = outstandingBalance({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: newPaid,
  });
  const fullyPaid = newOutstanding <= 0;

  await applyBtPaymentAllocation(supabase, userId, btRows, btPayment);

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
    payToNonBt,
    payToStatement,
    btPayment,
    newPaid,
    fullyPaid,
    txId: tx.id,
  });

  return mapCardStatement(updated);
}

export async function undoCardStatementPayment(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  statementId: string
): Promise<DbCardStatement> {
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
  if (!stmt.paymentSavingsTransactionId) {
    throw new Error("No payment to undo");
  }

  const tx = await getSavingsTransactionById(
    supabase,
    userId,
    stmt.paymentSavingsTransactionId
  );
  if (!tx) {
    throw new Error("Payment transaction not found");
  }
  if (tx.amount >= 0) {
    throw new Error("Invalid payment transaction");
  }

  const paymentAmount = roundMoney(Math.abs(tx.amount));
  if (paymentAmount > stmt.amountPaid + 0.01) {
    throw new Error("Undo exceeds statement amount paid");
  }

  const interestBeforeUndo = await recomputeInterestForStatement(
    supabase,
    userId,
    card,
    stmt
  );
  const paidBefore = roundMoney(stmt.amountPaid - paymentAmount);
  const outstandingBefore = outstandingBalance({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    interestAccrued: interestBeforeUndo,
    amountPaid: paidBefore,
  });
  const btRowsForUndo = await loadBtRowsForUndo(supabase, userId, card.id);
  const btOutstandingNow = btRowsForUndo.reduce(
    (sum, r) => sum + Math.max(0, r.outstanding),
    0
  );
  const btPayment = inferBtPaymentForUndo(
    paymentAmount,
    outstandingBefore,
    btOutstandingNow
  );

  if (btPayment > 0) {
    await reverseBtPaymentAllocation(supabase, userId, btRowsForUndo, btPayment);
    console.info("[card-statements] BT portion reversed on undo", {
      statementId,
      btPayment,
    });
  }

  await deleteSavingsTransaction(supabase, userId, tx.id);
  const newPaid = roundMoney(Math.max(0, stmt.amountPaid - paymentAmount));
  const interest = await recomputeInterestForStatement(supabase, userId, card, stmt);
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
      payment_financial_account_id: null,
      payment_savings_transaction_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", statementId)
    .select("*")
    .single();
  if (updErr) throw new Error(updErr.message);

  console.info("[card-statements] payment undone", {
    statementId,
    paymentAmount,
    btPayment,
    newPaid,
    txId: tx.id,
  });

  return mapCardStatement(updated);
}

export async function syncStatementAfterPaymentTransactionDelete(
  supabase: SupabaseClient,
  userId: string,
  deletedSavingsTransactionId: string,
  deletedAmount: number
): Promise<void> {
  if (!Number.isFinite(deletedAmount) || deletedAmount >= 0) return;

  const { data: stmtRow, error: stmtErr } = await supabase
    .from("card_statements")
    .select("*")
    .eq("user_id", userId)
    .eq("payment_savings_transaction_id", deletedSavingsTransactionId)
    .maybeSingle();
  if (stmtErr) throw new Error(stmtErr.message);
  if (!stmtRow) return;

  const stmt = mapCardStatement(stmtRow);
  const cards = await loadCreditCards(supabase, userId);
  const card = cards.find((c) => c.id === stmt.creditCardId);
  if (!card) {
    throw new Error("Card not found for statement");
  }

  const deletedPayment = roundMoney(Math.abs(deletedAmount));
  const newPaid = roundMoney(Math.max(0, stmt.amountPaid - deletedPayment));
  const interest = await recomputeInterestForStatement(supabase, userId, card, stmt);
  const newOutstanding = outstandingBalance({
    carriedForwardIn: stmt.carriedForwardIn,
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: newPaid,
  });
  const fullyPaid = newOutstanding <= 0;

  const { error: updErr } = await supabase
    .from("card_statements")
    .update({
      amount_paid: newPaid,
      paid_at: fullyPaid ? new Date().toISOString() : null,
      payment_financial_account_id: null,
      payment_savings_transaction_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stmt.id)
    .eq("user_id", userId);
  if (updErr) throw new Error(updErr.message);

  console.info("[card-statements] synced after payment tx delete", {
    statementId: stmt.id,
    deletedSavingsTransactionId,
    deletedAmount,
    newPaid,
  });
}
