import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CPF_TXN_CATEGORIES,
  cpfTxnOaDelta,
  isCpfTxnCategory,
  type CpfBtoStage,
  type CpfFundingSource,
  type CpfTransaction,
  type CpfTxnCategory,
} from "@/lib/cpf/types";
import { loadFinanceProfile, saveFinanceProfile } from "@/lib/profile/load";

export function mapCpfTransaction(row: Record<string, unknown>): CpfTransaction {
  return {
    id: String(row.id),
    txnDate: String(row.txn_date).slice(0, 10),
    direction: row.direction === "credit" ? "credit" : "debit",
    fundingSource: row.funding_source === "cash" ? "cash" : "cpf_oa",
    amount: Number(row.amount ?? 0),
    category: String(row.category) as CpfTxnCategory,
    btoStage: (row.bto_stage as CpfBtoStage | null) ?? null,
    note: String(row.note ?? ""),
    createdAt: String(row.created_at),
  };
}

export async function listCpfTransactions(
  supabase: SupabaseClient,
  userId: string,
  limit = 500
): Promise<CpfTransaction[]> {
  const { data, error } = await supabase
    .from("cpf_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCpfTransaction);
}

export type AddCpfTransactionInput = {
  txnDate: string;
  category: CpfTxnCategory;
  amount: number;
  fundingSource?: CpfFundingSource;
  btoStage?: CpfBtoStage | null;
  note?: string;
};

/**
 * Validates an add request against the category rules (direction comes from
 * the category; BTO stage must be one the category allows; cash only for BTO
 * debits). Returns the normalised row fields or throws a user-facing error.
 */
export function normalizeCpfTransactionInput(input: AddCpfTransactionInput) {
  if (!isCpfTxnCategory(input.category)) throw new Error("Unknown category");
  const meta = CPF_TXN_CATEGORIES[input.category];
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be above $0");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.txnDate ?? "")) throw new Error("Date must be YYYY-MM-DD");

  let btoStage: CpfBtoStage | null = null;
  if (meta.stages.length > 0) {
    btoStage = input.btoStage ?? meta.stages[0]!;
    if (!meta.stages.includes(btoStage)) {
      throw new Error(`${meta.label} can't be tagged to that BTO stage`);
    }
  }
  const fundingSource: CpfFundingSource = meta.cashOnly
    ? "cash"
    : meta.cpfOnly
      ? "cpf_oa"
      : input.fundingSource === "cash"
        ? "cash"
        : "cpf_oa";
  if (fundingSource === "cash" && (btoStage == null || meta.direction !== "debit")) {
    throw new Error("Only BTO payments can be logged as cash");
  }
  return {
    txn_date: input.txnDate,
    direction: meta.direction,
    funding_source: fundingSource,
    amount,
    category: input.category,
    bto_stage: btoStage,
    note: (input.note ?? "").trim(),
  };
}

/** Inserts a transaction, then applies its effect to the user's OA balance (cpf_oa rows only). */
export async function addCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  input: AddCpfTransactionInput
): Promise<{ transaction: CpfTransaction; oa: number }> {
  const fields = normalizeCpfTransactionInput(input);
  const { data: row, error } = await supabase
    .from("cpf_transactions")
    .insert({ user_id: userId, ...fields })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapCpfTransaction(row);

  const current = await loadFinanceProfile(supabase, userId);
  const delta = cpfTxnOaDelta(transaction);
  let oa = current.oa;
  if (delta !== 0) {
    const updated = await saveFinanceProfile(supabase, userId, {
      oa: Math.max(0, current.oa + delta),
    });
    oa = updated.oa;
  }
  console.info("[cpf/transactions] added", {
    userId,
    category: transaction.category,
    stage: transaction.btoStage,
  });
  return { transaction, oa };
}

/** Deletes a transaction, then reverses its effect on the OA balance. */
export async function deleteCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ oa: number }> {
  const { data: row, error: readErr } = await supabase
    .from("cpf_transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr || !row) throw new Error(readErr?.message ?? "Transaction not found");

  const { error: delErr } = await supabase
    .from("cpf_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  const current = await loadFinanceProfile(supabase, userId);
  const delta = cpfTxnOaDelta(mapCpfTransaction(row));
  let oa = current.oa;
  if (delta !== 0) {
    const updated = await saveFinanceProfile(supabase, userId, {
      oa: Math.max(0, current.oa - delta),
    });
    oa = updated.oa;
  }
  console.info("[cpf/transactions] deleted", { userId, id });
  return { oa };
}

/**
 * Edits a transaction in place, then moves the OA balance by the difference
 * between the old and new effect (e.g. CPF $1,000 → cash: OA goes back up $1,000).
 */
export async function updateCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: AddCpfTransactionInput
): Promise<{ transaction: CpfTransaction; oa: number }> {
  const fields = normalizeCpfTransactionInput(input);
  const { data: oldRow, error: readErr } = await supabase
    .from("cpf_transactions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr || !oldRow) throw new Error(readErr?.message ?? "Transaction not found");

  const { data: row, error } = await supabase
    .from("cpf_transactions")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const transaction = mapCpfTransaction(row);

  const diff = cpfTxnOaDelta(transaction) - cpfTxnOaDelta(mapCpfTransaction(oldRow));
  const current = await loadFinanceProfile(supabase, userId);
  let oa = current.oa;
  if (diff !== 0) {
    const updated = await saveFinanceProfile(supabase, userId, { oa: Math.max(0, current.oa + diff) });
    oa = updated.oa;
  }
  console.info("[cpf/transactions] updated", { userId, id, diff });
  return { transaction, oa };
}
