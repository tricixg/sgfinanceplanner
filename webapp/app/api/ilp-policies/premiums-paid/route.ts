import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import type { IlpRecordedPremiums } from "@/lib/finance/ilp";
import { roundMoney } from "@/lib/cards/interest-accrual";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

/** Recorded ILP premium payments per policy — feeds "Premiums paid to date" on Investment. */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: {} });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const { data, error } = await supabase
    .from("expenses")
    .select("ilp_policy_id, amount, spent_at")
    .eq("user_id", user.id)
    .eq("auto_category", "ilp")
    .not("ilp_policy_id", "is", null);

  if (error) {
    console.error("[api/ilp-policies/premiums-paid] load failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items: Record<string, IlpRecordedPremiums> = {};
  for (const row of data ?? []) {
    const policyId = String(row.ilp_policy_id);
    const ym = String(row.spent_at ?? "").slice(0, 7);
    const prev = items[policyId];
    items[policyId] = {
      total: roundMoney((prev?.total ?? 0) + Number(row.amount ?? 0)),
      firstYm: prev && prev.firstYm <= ym ? prev.firstYm : ym,
    };
  }

  return NextResponse.json({ configured: true, items });
}
