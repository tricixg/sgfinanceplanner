import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFinancialAccount } from "@/lib/expenses/auto-payment";
import { loadCreditCards } from "@/lib/credit-cards/load";
import type { DbCreditCard } from "@/lib/credit-cards/mappers";
import {
  outstandingBalance,
  roundMoney,
  statementCarryIn,
} from "@/lib/cards/interest-accrual";
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

/** Infer BT portion of a payment being undone (inverse of splitCardPaymentAmount). */
export function inferBtPaymentForUndo(
  paymentAmount: number,
  statementOutstandingBefore: number,
  btOutstandingNow: number
): number {
  let best = 0;
  const maxCents = Math.round(paymentAmount * 100);

  for (let cents = 0; cents <= maxCents; cents++) {
    const btPayment = roundMoney(cents / 100);
    const btBefore = roundMoney(btOutstandingNow + btPayment);
    if (btBefore > statementOutstandingBefore + 0.01) {
      break;
    }

    const split = splitCardPaymentAmount(
      paymentAmount,
      statementOutstandingBefore,
      btBefore
    );
    if (Math.abs(split.btPayment - btPayment) > 0.01) {
      continue;
    }
    if (
      split.payToNonBt < roundMoney(btPayment + 0.01) ||
      btPayment < 500
    ) {
      continue;
    }
    if (best === 0 || btPayment < best) {
      best = btPayment;
    }
  }

  if (best > 0) return best;

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

type StatementOutstandingContext = {
  stmt: DbCardStatement;
  interest: number;
  outstanding: number;
  btRows: BtRow[];
  btOutstanding: number;
};

/** Load a statement (scoped to the card) plus its recomputed interest/outstanding/BT state. */
async function loadStatementOutstandingContext(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  statementId: string
): Promise<StatementOutstandingContext> {
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
    carriedForwardIn: statementCarryIn(stmt),
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: stmt.amountPaid,
  });

  const btRows = await loadActiveBtRows(supabase, userId, card.id);
  const btOutstanding = btRows.reduce((sum, r) => sum + Math.max(0, r.outstanding), 0);

  return { stmt, interest, outstanding, btRows, btOutstanding };
}

/** Resolve a statement's owning card from its id alone (no card already in hand). */
async function resolveCardForStatement(
  supabase: SupabaseClient,
  userId: string,
  statementId: string
): Promise<DbCreditCard> {
  const { data: row, error } = await supabase
    .from("card_statements")
    .select("credit_card_id")
    .eq("id", statementId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Statement not found");

  const cards = await loadCreditCards(supabase, userId);
  const card = cards.find((c) => c.id === row.credit_card_id);
  if (!card) throw new Error("Card not found");
  return card;
}

/** Read-only preview of a statement's outstanding balance, for validating before a mutation. */
export async function previewStatementOutstanding(
  supabase: SupabaseClient,
  userId: string,
  statementId: string
): Promise<{ card: DbCreditCard; outstanding: number }> {
  const card = await resolveCardForStatement(supabase, userId, statementId);
  const ctx = await loadStatementOutstandingContext(supabase, userId, card, statementId);
  return { card, outstanding: roundMoney(ctx.outstanding) };
}

/** Split+allocate `amount` against a statement's outstanding (and any BT loans), updating card_statements. */
async function applyPaymentGivenContext(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  ctx: StatementOutstandingContext,
  amount: number,
  linkFields?: { paymentFinancialAccountId: string; paymentSavingsTransactionId: string }
): Promise<DbCardStatement> {
  const { stmt, interest, outstanding, btRows, btOutstanding } = ctx;
  const maxPayable = roundMoney(outstanding);
  if (amount > maxPayable + 0.01) {
    throw new Error(`Payment exceeds outstanding balance (${maxPayable})`);
  }

  const { payToNonBt, btPayment } = splitCardPaymentAmount(amount, outstanding, btOutstanding);
  const newPaid = roundMoney(stmt.amountPaid + amount);
  const newOutstanding = outstandingBalance({
    carriedForwardIn: statementCarryIn(stmt),
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: newPaid,
  });
  const fullyPaid = newOutstanding <= 0;

  await applyBtPaymentAllocation(supabase, userId, btRows, btPayment);

  const patch: Record<string, unknown> = {
    amount_paid: newPaid,
    paid_at: fullyPaid ? new Date().toISOString() : null,
    interest_accrued: fullyPaid ? 0 : interest,
    updated_at: new Date().toISOString(),
  };
  if (linkFields) {
    patch.payment_financial_account_id = linkFields.paymentFinancialAccountId;
    patch.payment_savings_transaction_id = linkFields.paymentSavingsTransactionId;
  }

  const { data: updated, error: updErr } = await supabase
    .from("card_statements")
    .update(patch)
    .eq("id", statementId)
    .select("*")
    .single();

  if (updErr) throw new Error(updErr.message);

  console.info("[card-statements] payment recorded", {
    statementId,
    amount,
    payToNonBt,
    btPayment,
    newPaid,
    fullyPaid,
    linked: Boolean(linkFields),
  });

  return mapCardStatement(updated);
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

  const ctx = await loadStatementOutstandingContext(supabase, userId, card, statementId);
  const maxPayable = roundMoney(ctx.outstanding);
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
    note: cardPaymentNote(card.name, ctx.stmt.statementCloseDate),
  });

  return applyPaymentGivenContext(supabase, userId, statementId, ctx, amount, {
    paymentFinancialAccountId: financialAccountId,
    paymentSavingsTransactionId: tx.id,
  });
}

/** Apply a reimbursement amount as a payment credit against a statement (no cash moves —
 * the refund was credited directly on the card). Recorded in card_statement_credits so
 * deleting the originating reimbursement can reverse it independently of any real cash
 * payment already linked to this statement. */
export async function applyReimbursementCreditToStatement(
  supabase: SupabaseClient,
  userId: string,
  statementId: string,
  amount: number,
  source: { recordType: "savings" | "budget"; recordId: string },
  note?: string
): Promise<DbCardStatement> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be positive");
  }

  const card = await resolveCardForStatement(supabase, userId, statementId);
  const ctx = await loadStatementOutstandingContext(supabase, userId, card, statementId);

  const updated = await applyPaymentGivenContext(supabase, userId, statementId, ctx, amount);

  const { error: creditErr } = await supabase.from("card_statement_credits").insert({
    user_id: userId,
    card_statement_id: statementId,
    amount,
    note: note ?? "",
    source_record_type: source.recordType,
    source_record_id: source.recordId,
  });
  if (creditErr) throw new Error(creditErr.message);

  console.info("[card-statements] reimbursement credit applied", {
    statementId,
    amount,
    source,
  });

  return updated;
}

/** Reverse any reimbursement credit(s) created from a given ledger row before it's deleted. */
export async function reverseStatementCreditByLedgerRecord(
  supabase: SupabaseClient,
  userId: string,
  recordType: "savings" | "budget",
  recordId: string
): Promise<void> {
  const { data: credits, error } = await supabase
    .from("card_statement_credits")
    .select("id, card_statement_id, amount")
    .eq("user_id", userId)
    .eq("source_record_type", recordType)
    .eq("source_record_id", recordId);
  if (error) throw new Error(error.message);
  if (!credits?.length) return;

  for (const credit of credits) {
    const statementId = String(credit.card_statement_id);
    const amount = roundMoney(Number(credit.amount ?? 0));

    const card = await resolveCardForStatement(supabase, userId, statementId);
    await reversePaymentAmount(supabase, userId, card, statementId, amount, {
      clearPaymentLink: false,
    });

    const { error: delErr } = await supabase
      .from("card_statement_credits")
      .delete()
      .eq("id", credit.id)
      .eq("user_id", userId);
    if (delErr) throw new Error(delErr.message);
  }

  console.info("[card-statements] reimbursement credit(s) reversed", {
    recordType,
    recordId,
    count: credits.length,
  });
}

/** Reverse `paymentAmount` off a statement (and any BT loans it covered). Only the
 * real-cash undo path clears payment_financial_account_id/payment_savings_transaction_id —
 * reversing a reimbursement credit must leave those untouched since they may belong to a
 * separate, still-valid cash payment on the same statement. */
async function reversePaymentAmount(
  supabase: SupabaseClient,
  userId: string,
  card: DbCreditCard,
  statementId: string,
  paymentAmount: number,
  opts: { clearPaymentLink: boolean }
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
    carriedForwardIn: statementCarryIn(stmt),
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

  const newPaid = roundMoney(Math.max(0, stmt.amountPaid - paymentAmount));
  const interest = await recomputeInterestForStatement(supabase, userId, card, stmt);
  const newOutstanding = outstandingBalance({
    carriedForwardIn: statementCarryIn(stmt),
    actualAmount: stmt.actualAmount,
    interestAccrued: interest,
    amountPaid: newPaid,
  });
  const fullyPaid = newOutstanding <= 0;

  const patch: Record<string, unknown> = {
    amount_paid: newPaid,
    paid_at: fullyPaid ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  if (opts.clearPaymentLink) {
    patch.payment_financial_account_id = null;
    patch.payment_savings_transaction_id = null;
  }

  const { data: updated, error: updErr } = await supabase
    .from("card_statements")
    .update(patch)
    .eq("id", statementId)
    .select("*")
    .single();
  if (updErr) throw new Error(updErr.message);

  console.info("[card-statements] payment undone", {
    statementId,
    paymentAmount,
    btPayment,
    newPaid,
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
  await deleteSavingsTransaction(supabase, userId, tx.id);

  return reversePaymentAmount(supabase, userId, card, statementId, paymentAmount, {
    clearPaymentLink: true,
  });
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
    carriedForwardIn: statementCarryIn(stmt),
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
