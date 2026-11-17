import { apiError } from "@/lib/api/api-error";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { mapCpfTransaction } from "@/lib/cpf/transactions";
import type { CpfTransaction } from "@/lib/cpf/types";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type PartnerBtoPaymentsResponse = {
  configured: boolean;
  paired: boolean;
  items: CpfTransaction[];
};

/**
 * The caller's linked partner's BTO-tagged CPF/cash payments, for the BTO
 * planner's household payment history. Deliberately scoped to rows with a
 * bto_stage — the partner's other CPF movements stay private. Uses the
 * service-role client because cpf_transactions RLS is owner-only, mirroring
 * app/api/household/partner-cpf/route.ts.
 */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, paired: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);
  const { data: members, error: memErr } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);
  if (memErr) {
    console.error("[api/household/partner-bto-payments] members failed", memErr.message);
    return apiError("api/household/partner-bto-payments", memErr);
  }

  const partnerId = (members ?? []).map((m) => m.user_id).find((id) => id !== user.id);
  if (!partnerId) {
    return NextResponse.json({ configured: true, paired: false, items: [] });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.warn("[api/household/partner-bto-payments] admin client unavailable");
    return NextResponse.json({ configured: true, paired: true, items: [] });
  }

  const { data, error } = await admin
    .from("cpf_transactions")
    .select("*")
    .eq("user_id", partnerId)
    .not("bto_stage", "is", null)
    .order("txn_date", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[api/household/partner-bto-payments] query failed", error.message);
    return apiError("api/household/partner-bto-payments", error);
  }

  const items = (data ?? []).map(mapCpfTransaction);
  console.info("[api/household/partner-bto-payments] GET", { userId: user.id, count: items.length });
  return NextResponse.json({
    configured: true,
    paired: true,
    items,
  } satisfies PartnerBtoPaymentsResponse);
}
