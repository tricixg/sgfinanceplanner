import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type PartnerCpfResponse = {
  configured: boolean;
  paired: boolean;
  partnerEmail: string | null;
  oa: number | null;
  latestMonthlyOA: number | null;
  latestContributionMonth: string | null;
};

const EMPTY: Omit<PartnerCpfResponse, "configured"> = {
  paired: false,
  partnerEmail: null,
  oa: null,
  latestMonthlyOA: null,
  latestContributionMonth: null,
};

/**
 * OA-only CPF snapshot for the caller's linked partner, for the BTO planner.
 * Deliberately scoped to CPF fields only (never salary/cash/debt/etc.) —
 * uses the service-role client because user_finance_profile/cpf_contributions
 * RLS is owner-only, mirroring the existing service-role email lookup in
 * lib/household/invite-emails.ts.
 */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, ...EMPTY });
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
    console.error("[api/household/partner-cpf] members failed", memErr.message);
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const partnerId = (members ?? []).map((m) => m.user_id).find((id) => id !== user.id);
  if (!partnerId) {
    return NextResponse.json({ configured: true, ...EMPTY });
  }

  const admin = createAdminClient();
  if (!admin) {
    console.warn("[api/household/partner-cpf] admin client unavailable — no service role key");
    return NextResponse.json({ configured: true, ...EMPTY, paired: true });
  }

  const [{ data: partnerAuth }, { data: profile }, { data: contribRows }] = await Promise.all([
    admin.auth.admin.getUserById(partnerId),
    admin.from("user_finance_profile").select("oa").eq("user_id", partnerId).maybeSingle(),
    admin
      .from("cpf_contributions")
      .select("oa, month")
      .eq("user_id", partnerId)
      .order("month", { ascending: false })
      .limit(1),
  ]);

  const latest = contribRows?.[0];

  console.info("[api/household/partner-cpf] GET", {
    userId: user.id,
    householdId,
    partnerId,
    hasProfile: Boolean(profile),
    hasContribution: Boolean(latest),
  });

  return NextResponse.json({
    configured: true,
    paired: true,
    partnerEmail: partnerAuth.user?.email?.trim() ?? null,
    oa: profile ? Number(profile.oa ?? 0) : null,
    latestMonthlyOA: latest ? Number(latest.oa ?? 0) : null,
    latestContributionMonth: latest ? String(latest.month).slice(0, 7) : null,
  } satisfies PartnerCpfResponse);
}
