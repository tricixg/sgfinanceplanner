import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CPF_TXN_CATEGORIES,
  isCpfTxnCategory,
  type CpfBtoStage,
  type CpfFundingSource,
  type CpfTransaction,
  type CpfTxnCategory,
} from "@/lib/cpf/types";
import { callLedgerRpc } from "@/lib/supabase/rpc";
import { CPF_LEDGER_MIGRATION } from "@/lib/cpf/contributions";

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
  /** Idempotency key (one per submit); a retry returns the original row. */
  clientRequestId?: string | null;
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

function rpcFields(fields: ReturnType<typeof normalizeCpfTransactionInput>) {
  return {
    p_txn_date: fields.txn_date,
    p_direction: fields.direction,
    p_funding_source: fields.funding_source,
    p_amount: fields.amount,
    p_category: fields.category,
    p_bto_stage: fields.bto_stage,
    p_note: fields.note,
  };
}

/** Inserts a transaction and applies its effect to OA (cpf_oa rows only) — one database transaction. */
export async function addCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  input: AddCpfTransactionInput
): Promise<{ transaction: CpfTransaction; oa: number }> {
  const fields = normalizeCpfTransactionInput(input);
  const result = await callLedgerRpc<{ transaction: Record<string, unknown>; oa: unknown; replayed: boolean }>(
    supabase,
    "cpf_add_transaction",
    {
      p_user_id: userId,
      ...rpcFields(fields),
      p_client_request_id: input.clientRequestId ?? null,
    },
    CPF_LEDGER_MIGRATION
  );
  const transaction = mapCpfTransaction(result.transaction);
  console.info(result.replayed ? "[cpf/transactions] replayed (idempotency key)" : "[cpf/transactions] added", {
    userId,
    category: transaction.category,
    stage: transaction.btoStage,
  });
  return { transaction, oa: Number(result.oa ?? 0) };
}

/** Deletes a transaction and reverses its effect on OA — one database transaction. */
export async function deleteCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ oa: number }> {
  const oa = await callLedgerRpc<number>(
    supabase,
    "cpf_delete_transaction",
    { p_user_id: userId, p_transaction_id: id },
    CPF_LEDGER_MIGRATION
  );
  console.info("[cpf/transactions] deleted", { userId, id });
  return { oa: Number(oa ?? 0) };
}

/**
 * Edits a transaction in place and moves OA by the difference between the
 * old and new effect (e.g. CPF $1,000 → cash: OA goes back up $1,000) — one
 * database transaction.
 */
export async function updateCpfTransaction(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: AddCpfTransactionInput
): Promise<{ transaction: CpfTransaction; oa: number }> {
  const fields = normalizeCpfTransactionInput(input);
  const result = await callLedgerRpc<{ transaction: Record<string, unknown>; oa: unknown }>(
    supabase,
    "cpf_update_transaction",
    { p_user_id: userId, p_transaction_id: id, ...rpcFields(fields) },
    CPF_LEDGER_MIGRATION
  );
  const transaction = mapCpfTransaction(result.transaction);
  console.info("[cpf/transactions] updated", { userId, id });
  return { transaction, oa: Number(result.oa ?? 0) };
}
