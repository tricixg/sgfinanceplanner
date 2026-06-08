import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBudgetRow } from "@/lib/budget/parse-csv";
import { loadBudgetLines } from "@/lib/budget/load";
import { mapDbBudgetLine, resolveBudgetLineId } from "@/lib/expenses/budget-match";
import {
  findOrCreateFinancialAccountByName,
  syncCashFinancialAccounts,
} from "@/lib/financial-accounts/sync";
import type {
  BudgetTransaction,
  BudgetTransactionType,
} from "@/lib/transactions/types";
import { mapBudgetTransaction } from "@/lib/budget/mappers";

export type ListBudgetOpts = {
  limit?: number;
  offset?: number;
  financialAccountId?: string;
  transactionType?: BudgetTransactionType;
  dateFrom?: string;
  dateTo?: string;
};

export async function listBudgetTransactions(
  supabase: SupabaseClient,
  userId: string,
  opts: ListBudgetOpts = {}
): Promise<{ items: BudgetTransaction[]; total: number; nextOffset: number | null }> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  let query = supabase
    .from("budget_transactions")
    .select("*, financial_accounts(name)", { count: "exact" })
    .eq("user_id", userId)
    .is("expense_id", null);

  if (opts.financialAccountId) {
    query = query.eq("financial_account_id", opts.financialAccountId);
  }
  if (opts.transactionType) {
    query = query.eq("transaction_type", opts.transactionType);
  }
  if (opts.dateFrom) query = query.gte("spent_at", opts.dateFrom);
  if (opts.dateTo) query = query.lte("spent_at", opts.dateTo);

  const { data, error, count } = await query
    .order("spent_at", { ascending: false })
    .order("spent_time", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r) => mapBudgetTransaction(r));
  return {
    items,
    total: count ?? 0,
    nextOffset: offset + (data?.length ?? 0) < (count ?? 0) ? offset + limit : null,
  };
}

/** Sum signed amounts (income +, expense/subscription −) for budget rows matching list filters. */
export async function sumBudgetTransactionAmounts(
  supabase: SupabaseClient,
  userId: string,
  opts: Omit<ListBudgetOpts, "limit" | "offset"> = {}
): Promise<number> {
  let query = supabase
    .from("budget_transactions")
    .select("amount, transaction_type")
    .eq("user_id", userId)
    .is("expense_id", null);

  if (opts.financialAccountId) {
    query = query.eq("financial_account_id", opts.financialAccountId);
  }
  if (opts.transactionType) {
    query = query.eq("transaction_type", opts.transactionType);
  }
  if (opts.dateFrom) query = query.gte("spent_at", opts.dateFrom);
  if (opts.dateTo) query = query.lte("spent_at", opts.dateTo);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).reduce((sum, row) => {
    const amount = Number(row.amount ?? 0);
    return sum + (row.transaction_type === "income" ? amount : -amount);
  }, 0);
}

export async function countBudgetTransactions(
  supabase: SupabaseClient,
  userId: string,
  opts: Pick<ListBudgetOpts, "financialAccountId" | "transactionType"> = {}
): Promise<number> {
  let query = supabase
    .from("budget_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (opts.financialAccountId) {
    query = query.eq("financial_account_id", opts.financialAccountId);
  }
  if (opts.transactionType) {
    query = query.eq("transaction_type", opts.transactionType);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getBudgetTransactionById(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<BudgetTransaction | null> {
  const { data, error } = await supabase
    .from("budget_transactions")
    .select("*, financial_accounts(name)")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBudgetTransaction(data) : null;
}

export async function updateBudgetTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  patch: Partial<{
    amount: number;
    spentAt: string;
    spentTime: string | null;
    note: string;
    category: string;
    financialAccountId: string | null;
  }>
): Promise<BudgetTransaction | null> {
  const row: Record<string, unknown> = {};
  if (typeof patch.amount === "number") row.amount = patch.amount;
  if (typeof patch.spentAt === "string") row.spent_at = patch.spentAt.slice(0, 10);
  if (patch.spentTime !== undefined) row.spent_time = patch.spentTime;
  if (typeof patch.note === "string") row.note = patch.note;
  if (typeof patch.category === "string") row.category = patch.category;
  if (patch.financialAccountId !== undefined) {
    row.financial_account_id = patch.financialAccountId;
  }
  if (Object.keys(row).length === 0) return getBudgetTransactionById(supabase, userId, id);

  const { data, error } = await supabase
    .from("budget_transactions")
    .update(row)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*, financial_accounts(name)")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapBudgetTransaction(data) : null;
}

export async function deleteBudgetTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from("budget_transactions")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function createBudgetTransaction(
  supabase: SupabaseClient,
  userId: string,
  payload: {
    financialAccountId?: string | null;
    ledger?: string;
    category: string;
    subcategory?: string;
    currency?: string;
    amount: number;
    recorder?: string;
    spentAt: string;
    spentTime?: string | null;
    tag?: string;
    note?: string;
    transactionType: BudgetTransactionType;
    importBatchId?: string | null;
    budgetLineId?: string | null;
    sourceRecordType?: "expense" | "savings" | "budget" | null;
    sourceRecordId?: string | null;
  }
): Promise<BudgetTransaction> {
  const { data, error } = await supabase
    .from("budget_transactions")
    .insert({
      user_id: userId,
      financial_account_id: payload.financialAccountId ?? null,
      ledger: payload.ledger ?? "",
      category: payload.category,
      subcategory: payload.subcategory ?? "",
      currency: payload.currency ?? "SGD",
      amount: payload.amount,
      recorder: payload.recorder ?? "",
      spent_at: payload.spentAt.slice(0, 10),
      spent_time: payload.spentTime ?? null,
      tag: payload.tag ?? "",
      note: payload.note ?? "",
      transaction_type: payload.transactionType,
      import_batch_id: payload.importBatchId ?? null,
      budget_line_id: payload.budgetLineId ?? null,
      source_record_type: payload.sourceRecordType ?? null,
      source_record_id: payload.sourceRecordId ?? null,
    })
    .select("*, financial_accounts(name)")
    .single();
  if (error) throw new Error(error.message);
  return mapBudgetTransaction(data);
}

export type ImportBudgetOptions = {
  createMissingAccounts?: boolean;
  importBatchId?: string;
};

export async function importBudgetRows(
  supabase: SupabaseClient,
  userId: string,
  rows: ParsedBudgetRow[],
  opts: ImportBudgetOptions = {}
): Promise<{ inserted: number; skipped: number; accountsCreated: number }> {
  const createMissing = opts.createMissingAccounts !== false;
  const batchId = opts.importBatchId ?? crypto.randomUUID();

  await syncCashFinancialAccounts(supabase, userId);

  const budgetItems = await loadBudgetLines(supabase, userId);
  const budgetLines = budgetItems
    .filter((b) => b.id)
    .map((b, i) =>
      mapDbBudgetLine({
        id: b.id,
        category: b.cat,
        amount: b.amt,
        line_type: b.type,
        sort_order: i,
      })
    );

  let inserted = 0;
  let skipped = 0;
  let accountsCreated = 0;

  for (const row of rows) {
    let financialAccountId: string | null = null;
    const accountName = row.account.trim();

    if (accountName) {
      const { data: existingAcct } = await supabase
        .from("financial_accounts")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", accountName)
        .maybeSingle();

      const acct = await findOrCreateFinancialAccountByName(
        supabase,
        userId,
        accountName,
        createMissing
      );
      if (!acct) {
        skipped++;
        continue;
      }
      financialAccountId = acct.id;
      if (!existingAcct?.id) accountsCreated++;
    }

    const budgetLineId = resolveBudgetLineId(budgetLines, row.category, null);

    const { error } = await supabase.from("budget_transactions").insert({
      user_id: userId,
      financial_account_id: financialAccountId,
      ledger: row.ledger,
      category: row.category,
      subcategory: row.subcategory,
      currency: row.currency,
      amount: row.amount,
      recorder: row.recorder,
      spent_at: row.spentAt,
      spent_time: row.spentTime,
      tag: row.tag,
      note: row.note,
      transaction_type: row.transactionType,
      import_batch_id: batchId,
      budget_line_id: budgetLineId,
    });

    if (error) {
      console.warn("[budget] import row failed", error.message);
      skipped++;
    } else {
      inserted++;
    }
  }

  console.info("[budget] import complete", {
    userId,
    inserted,
    skipped,
    accountsCreated,
    batchId,
  });

  return { inserted, skipped, accountsCreated };
}
