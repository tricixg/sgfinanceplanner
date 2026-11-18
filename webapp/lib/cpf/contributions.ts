import type { SupabaseClient } from "@supabase/supabase-js";
import type { CpfContribution } from "@/lib/cpf/types";
import { callLedgerRpc, RpcError } from "@/lib/supabase/rpc";

function mapCpfContribution(row: Record<string, unknown>): CpfContribution {
  return {
    id: String(row.id),
    month: String(row.month).slice(0, 10),
    oa: Number(row.oa ?? 0),
    sa: Number(row.sa ?? 0),
    ma: Number(row.ma ?? 0),
    note: String(row.note ?? ""),
    creditedOn: row.credited_on ? String(row.credited_on).slice(0, 10) : null,
    createdAt: String(row.created_at),
  };
}

export async function listCpfContributions(
  supabase: SupabaseClient,
  userId: string,
  limit = 60
): Promise<CpfContribution[]> {
  const { data, error } = await supabase
    .from("cpf_contributions")
    .select("*")
    .eq("user_id", userId)
    .order("month", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCpfContribution);
}

export type AddCpfContributionInput = {
  month: string;
  oa: number;
  sa: number;
  ma: number;
  note?: string;
  /** Date it was credited (YYYY-MM-DD). Optional for older clients. */
  creditedOn?: string | null;
  /** Idempotency key (one per submit); a retry returns the original row. */
  clientRequestId?: string | null;
};

export type CpfBalance = { oa: number; sa: number; ma: number };

/** Migration that adds the CPF functions used below. */
export const CPF_LEDGER_MIGRATION = "074_cpf_ledger_functions.sql";

function validateAmounts(input: AddCpfContributionInput) {
  const { oa, sa, ma } = input;
  if (![oa, sa, ma].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error("OA, SA, and MA must be non-negative numbers");
  }
  if (oa === 0 && sa === 0 && ma === 0) {
    throw new Error("Enter at least one non-zero contribution amount");
  }
}

function creditedOnOrNull(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toBalance(p: { oa: unknown; sa: unknown; ma: unknown }): CpfBalance {
  return { oa: Number(p.oa ?? 0), sa: Number(p.sa ?? 0), ma: Number(p.ma ?? 0) };
}

type ContributionRpcResult = {
  contribution: Record<string, unknown>;
  profile: { oa: unknown; sa: unknown; ma: unknown };
  replayed?: boolean;
};

/**
 * Inserts a contribution log row and increments the user's current OA/SA/MA
 * by the same amounts — one database transaction.
 */
export async function addCpfContribution(
  supabase: SupabaseClient,
  userId: string,
  input: AddCpfContributionInput
): Promise<{ contribution: CpfContribution; profile: CpfBalance }> {
  validateAmounts(input);

  let result: ContributionRpcResult;
  try {
    result = await callLedgerRpc<ContributionRpcResult>(
      supabase,
      "cpf_add_contribution",
      {
        p_user_id: userId,
        p_month: input.month,
        p_oa: input.oa,
        p_sa: input.sa,
        p_ma: input.ma,
        p_note: input.note ?? "",
        p_credited_on: creditedOnOrNull(input.creditedOn),
        p_client_request_id: input.clientRequestId ?? null,
      },
      CPF_LEDGER_MIGRATION
    );
  } catch (e) {
    if (e instanceof RpcError && e.code === "23505") {
      throw new Error(
        `Already logged a contribution for ${input.month} — delete it first to re-log.`
      );
    }
    throw e;
  }

  console.info(
    result.replayed ? "[cpf/contributions] replayed (idempotency key)" : "[cpf/contributions] added",
    { userId, month: input.month }
  );

  return { contribution: mapCpfContribution(result.contribution), profile: toBalance(result.profile) };
}

/** Deletes a contribution log row and reverses its effect on OA/SA/MA — one database transaction. */
export async function deleteCpfContribution(
  supabase: SupabaseClient,
  userId: string,
  contributionId: string
): Promise<CpfBalance> {
  const profile = await callLedgerRpc<{ oa: unknown; sa: unknown; ma: unknown }>(
    supabase,
    "cpf_delete_contribution",
    { p_user_id: userId, p_contribution_id: contributionId },
    CPF_LEDGER_MIGRATION
  );
  console.info("[cpf/contributions] deleted", { userId, contributionId });
  return toBalance(profile);
}

/**
 * Edits a contribution in place and moves OA/SA/MA by the difference between
 * the old and new amounts — one database transaction.
 */
export async function updateCpfContribution(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: AddCpfContributionInput
): Promise<{ contribution: CpfContribution; profile: CpfBalance }> {
  validateAmounts(input);

  let result: ContributionRpcResult;
  try {
    result = await callLedgerRpc<ContributionRpcResult>(
      supabase,
      "cpf_update_contribution",
      {
        p_user_id: userId,
        p_contribution_id: id,
        p_month: input.month,
        p_oa: input.oa,
        p_sa: input.sa,
        p_ma: input.ma,
        p_note: input.note ?? "",
        p_credited_on: creditedOnOrNull(input.creditedOn),
      },
      CPF_LEDGER_MIGRATION
    );
  } catch (e) {
    if (e instanceof RpcError && e.code === "23505") {
      throw new Error(`Already logged a contribution for ${input.month.slice(0, 7)}`);
    }
    throw e;
  }
  console.info("[cpf/contributions] updated", { userId, id });
  return { contribution: mapCpfContribution(result.contribution), profile: toBalance(result.profile) };
}
