import type { CardStatementRow } from "@/lib/cards/types";

export type DbCardStatement = {
  id: string;
  userId: string;
  creditCardId: string;
  statementCloseDate: string;
  cycleStartDate: string;
  cycleEndDate: string;
  paymentDueDate: string;
  carriedForwardIn: number;
  actualAmount: number | null;
  minimumDue: number | null;
  trackedAmount: number | null;
  amountPaid: number;
  interestAccrued: number;
  paidAt: string | null;
  paymentFinancialAccountId: string | null;
  paymentSavingsTransactionId: string | null;
};

export function mapCardStatement(row: Record<string, unknown>): DbCardStatement {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    creditCardId: String(row.credit_card_id),
    statementCloseDate: String(row.statement_close_date).slice(0, 10),
    cycleStartDate: String(row.cycle_start_date).slice(0, 10),
    cycleEndDate: String(row.cycle_end_date).slice(0, 10),
    paymentDueDate: String(row.payment_due_date).slice(0, 10),
    carriedForwardIn: Number(row.carried_forward_in ?? 0),
    actualAmount:
      row.actual_amount == null ? null : Number(row.actual_amount),
    minimumDue:
      row.minimum_due == null ? null : Number(row.minimum_due),
    trackedAmount:
      row.tracked_amount == null ? null : Number(row.tracked_amount),
    amountPaid: Number(row.amount_paid ?? 0),
    interestAccrued: Number(row.interest_accrued ?? 0),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    paymentFinancialAccountId: row.payment_financial_account_id
      ? String(row.payment_financial_account_id)
      : null,
    paymentSavingsTransactionId: row.payment_savings_transaction_id
      ? String(row.payment_savings_transaction_id)
      : null,
  };
}

export function toCardStatementRow(
  db: DbCardStatement,
  meta: { creditCardKey: string; cardName: string }
): CardStatementRow {
  return {
    id: db.id,
    creditCardId: db.creditCardId,
    creditCardKey: meta.creditCardKey,
    cardName: meta.cardName,
    statementCloseDate: db.statementCloseDate,
    cycleStartDate: db.cycleStartDate,
    cycleEndDate: db.cycleEndDate,
    paymentDueDate: db.paymentDueDate,
    carriedForwardIn: db.carriedForwardIn,
    actualAmount: db.actualAmount,
    minimumDue: db.minimumDue,
    trackedAmount: db.trackedAmount ?? 0,
    amountPaid: db.amountPaid,
    interestAccrued: db.interestAccrued,
    paidAt: db.paidAt,
    paymentFinancialAccountId: db.paymentFinancialAccountId,
    paymentSavingsTransactionId: db.paymentSavingsTransactionId,
  };
}
