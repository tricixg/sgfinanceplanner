import type { SupabaseClient } from "@supabase/supabase-js";
import type { CpfContribution } from "@/lib/cpf/types";
import { loadFinanceProfile, saveFinanceProfile } from "@/lib/profile/load";

function mapCpfContribution(row: Record<string, unknown>): CpfContribution {
  return {
    id: String(row.id),
    month: String(row.month).slice(0, 10),
    oa: Number(row.oa ?? 0),
    sa: Number(row.sa ?? 0),
    ma: Number(row.ma ?? 0),
    note: String(row.note ?? ""),
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
};

export type CpfBalance = { oa: number; sa: number; ma: number };

/** Inserts a contribution log row, then increments the user's current OA/SA/MA balances by the same amounts. */
export async function addCpfContribution(
  supabase: SupabaseClient,
  userId: string,
  input: AddCpfContributionInput
): Promise<{ contribution: CpfContribution; profile: CpfBalance }> {
  const { oa, sa, ma } = input;
  if (![oa, sa, ma].every((n) => Number.isFinite(n) && n >= 0)) {
    throw new Error("OA, SA, and MA must be non-negative numbers");
  }
  if (oa === 0 && sa === 0 && ma === 0) {
    throw new Error("Enter at least one non-zero contribution amount");
  }

  const { data: row, error: insErr } = await supabase
    .from("cpf_contributions")
    .insert({
      user_id: userId,
      month: input.month,
      oa,
      sa,
      ma,
      note: input.note ?? "",
    })
    .select("*")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      throw new Error(
        `Already logged a contribution for ${input.month} — delete it first to re-log.`
      );
    }
    throw new Error(insErr.message);
  }

  const current = await loadFinanceProfile(supabase, userId);
  const updated = await saveFinanceProfile(supabase, userId, {
    oa: current.oa + oa,
    sa: current.sa + sa,
    ma: current.ma + ma,
  });

  console.info("[cpf/contributions] added", { userId, month: input.month, oa, sa, ma });

  return {
    contribution: mapCpfContribution(row),
    profile: { oa: updated.oa, sa: updated.sa, ma: updated.ma },
  };
}

/** Deletes a contribution log row, then reverses its effect on the current OA/SA/MA balances. */
export async function deleteCpfContribution(
  supabase: SupabaseClient,
  userId: string,
  contributionId: string
): Promise<CpfBalance> {
  const { data: row, error: readErr } = await supabase
    .from("cpf_contributions")
    .select("*")
    .eq("id", contributionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr || !row) {
    throw new Error(readErr?.message ?? "Contribution not found");
  }

  const { error: delErr } = await supabase
    .from("cpf_contributions")
    .delete()
    .eq("id", contributionId)
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  const current = await loadFinanceProfile(supabase, userId);
  const updated = await saveFinanceProfile(supabase, userId, {
    oa: Math.max(0, current.oa - Number(row.oa ?? 0)),
    sa: Math.max(0, current.sa - Number(row.sa ?? 0)),
    ma: Math.max(0, current.ma - Number(row.ma ?? 0)),
  });

  console.info("[cpf/contributions] deleted", { userId, contributionId });

  return { oa: updated.oa, sa: updated.sa, ma: updated.ma };
}
