import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedBudgetRow } from "@/lib/budget/parse-csv";
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
    .eq("user_id", userId);

  if (opts.financialAccountId) {
    query = query.eq("financial_account_id", opts.financialAccountId);
  }
  if (opts.transactionType) {
    query = query.eq("transaction_type", opts.transactionType);
  }

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
