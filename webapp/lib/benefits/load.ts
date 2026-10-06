import type { SupabaseClient } from "@supabase/supabase-js";
import { sgtTodayYmd } from "@/lib/time/sgt";
import { mapBenefit, mapBenefitClaim } from "@/lib/benefits/mappers";
import { computeBenefitUsage } from "@/lib/benefits/usage";
import type { Benefit, BenefitClaim, BenefitInput, BenefitUsage } from "@/lib/benefits/types";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function loadBenefits(
  supabase: SupabaseClient,
  userId: string
): Promise<Benefit[]> {
  const { data, error } = await supabase
    .from("benefits")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBenefit);
}

export async function loadBenefitClaims(
  supabase: SupabaseClient,
  userId: string,
  benefitIds?: string[]
): Promise<BenefitClaim[]> {
  let query = supabase
    .from("benefit_claims")
    .select("*")
    .eq("user_id", userId)
    .order("claimed_at", { ascending: false });
  if (benefitIds) {
    if (!benefitIds.length) return [];
    query = query.in("benefit_id", benefitIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBenefitClaim);
}

/** Benefits merged with computed usage for the cycle containing today. */
export async function loadBenefitUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<BenefitUsage[]> {
  const benefits = await loadBenefits(supabase, userId);
  if (!benefits.length) return [];

  const claims = await loadBenefitClaims(supabase, userId, benefits.map((b) => b.id));
  const claimsByBenefit = new Map<string, BenefitClaim[]>();
  for (const claim of claims) {
    const list = claimsByBenefit.get(claim.benefitId) ?? [];
    list.push(claim);
    claimsByBenefit.set(claim.benefitId, list);
  }

  const today = sgtTodayYmd();
  return benefits.map((b) => computeBenefitUsage(b, claimsByBenefit.get(b.id) ?? [], today));
}

export async function saveBenefits(
  supabase: SupabaseClient,
  userId: string,
  incoming: BenefitInput[]
): Promise<void> {
  const { data: existing, error: existingErr } = await supabase
    .from("benefits")
    .select("id")
    .eq("user_id", userId);
  if (existingErr) throw new Error(existingErr.message);

  const keepIds = new Set(
    incoming.map((b) => b.id).filter((id): id is string => Boolean(id && UUID_RE.test(id)))
  );

  for (const row of existing ?? []) {
    if (!keepIds.has(row.id)) {
      const { error } = await supabase.from("benefits").delete().eq("id", row.id);
      if (error) throw new Error(error.message);
    }
  }

  for (let i = 0; i < incoming.length; i++) {
    const b = incoming[i];
    const id = b.id && UUID_RE.test(b.id) ? b.id : null;
    const payload = {
      name: (b.name ?? "").trim() || "Benefit",
      limit_amount: b.limitAmount != null ? Number(b.limitAmount) : null,
      cycle_months:
        b.cycleMonths != null && Number(b.cycleMonths) > 0 ? Math.round(Number(b.cycleMonths)) : null,
      cycle_anchor_date: b.cycleAnchorDate || sgtTodayYmd(),
      income_category_id: b.incomeCategoryId || null,
      notes: b.notes ?? "",
      sort_order: b.sortOrder ?? i,
      hidden: Boolean(b.hidden),
      updated_at: new Date().toISOString(),
    };

    if (id && keepIds.has(id)) {
      const { error } = await supabase
        .from("benefits")
        .update(payload)
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      continue;
    }

    const { error } = await supabase.from("benefits").insert({ ...payload, user_id: userId });
    if (error) throw new Error(error.message);
  }

  console.info("[benefits] saved", { userId, count: incoming.length });
}

export async function verifyBenefit(
  supabase: SupabaseClient,
  userId: string,
  benefitId: string
): Promise<Benefit | null> {
  const { data, error } = await supabase
    .from("benefits")
    .select("*")
    .eq("id", benefitId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapBenefit(data);
}

/** Record usage against a benefit, optionally linked to the reimbursement ledger row that caused it. */
export async function recordBenefitClaim(
  supabase: SupabaseClient,
  userId: string,
  input: {
    benefitId: string;
    amount: number;
    claimedAt?: string;
    note?: string;
    sourceRecordType?: "savings" | "budget" | null;
    sourceRecordId?: string | null;
  }
): Promise<BenefitClaim> {
  if (!(input.amount > 0)) throw new Error("Valid amount required");

  const { data, error } = await supabase
    .from("benefit_claims")
    .insert({
      user_id: userId,
      benefit_id: input.benefitId,
      amount: input.amount,
      claimed_at: input.claimedAt || sgtTodayYmd(),
      note: input.note ?? "",
      source_record_type: input.sourceRecordType ?? null,
      source_record_id: input.sourceRecordId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  console.info("[benefits] claim recorded", {
    userId,
    benefitId: input.benefitId,
    amount: input.amount,
  });
  return mapBenefitClaim(data);
}

/** Correct an existing claim — e.g. the date it should count toward a benefit's cycle. */
export async function updateBenefitClaim(
  supabase: SupabaseClient,
  userId: string,
  claimId: string,
  patch: { amount?: number; claimedAt?: string; note?: string }
): Promise<BenefitClaim> {
  const payload: Record<string, unknown> = {};
  if (patch.amount != null) {
    if (!(patch.amount > 0)) throw new Error("Valid amount required");
    payload.amount = patch.amount;
  }
  if (patch.claimedAt != null) payload.claimed_at = patch.claimedAt;
  if (patch.note != null) payload.note = patch.note;

  const { data, error } = await supabase
    .from("benefit_claims")
    .update(payload)
    .eq("id", claimId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  console.info("[benefits] claim updated", { userId, claimId, patch });
  return mapBenefitClaim(data);
}

export async function deleteBenefitClaim(
  supabase: SupabaseClient,
  userId: string,
  claimId: string
): Promise<void> {
  const { error } = await supabase
    .from("benefit_claims")
    .delete()
    .eq("id", claimId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Reverse any claim created by a reimbursement ledger row (savings/budget) before that row is deleted. */
export async function deleteBenefitClaimByLedgerRecord(
  supabase: SupabaseClient,
  userId: string,
  recordType: "savings" | "budget",
  recordId: string
): Promise<void> {
  const { error } = await supabase
    .from("benefit_claims")
    .delete()
    .eq("user_id", userId)
    .eq("source_record_type", recordType)
    .eq("source_record_id", recordId);
  if (error) throw new Error(error.message);
}
