import type { BudgetTransaction, BudgetTransactionType } from "@/lib/transactions/types";

export function mapBudgetTransaction(row: Record<string, unknown>): BudgetTransaction {
  const fa = row.financial_accounts as Record<string, unknown> | null | undefined;
  const accountName = fa?.name != null ? String(fa.name).trim() : null;

  const t = String(row.transaction_type ?? "expense");
  const transactionType: BudgetTransactionType =
    t === "income" || t === "subscription" ? t : "expense";

  return {
    id: String(row.id),
    userId: String(row.user_id),
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
    accountName: accountName || null,
    ledger: String(row.ledger ?? ""),
    category: String(row.category ?? ""),
    subcategory: String(row.subcategory ?? ""),
    currency: String(row.currency ?? "SGD"),
    amount: Number(row.amount ?? 0),
    recorder: String(row.recorder ?? ""),
    spentAt: String(row.spent_at),
    spentTime: row.spent_time != null ? String(row.spent_time).slice(0, 8) : null,
    tag: String(row.tag ?? ""),
    note: String(row.note ?? ""),
    transactionType,
    importBatchId: row.import_batch_id ? String(row.import_batch_id) : null,
    createdAt: String(row.created_at),
  };
}
