import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadFinanceProfile,
  loadIlpPolicies,
  loadInsurancePolicies,
  saveFinanceProfile,
  saveIlpPolicies,
  saveInsurancePolicies,
  migrateProfileFromDashboard,
  profileFromState,
} from "@/lib/profile/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { isPersistedDashboardSnapshot } from "@/lib/validate-state";
import { mergeWithDefaults, createEmptyState } from "@/lib/finance/defaults";
import type { DashboardState } from "@/lib/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  try {
    const supabase = await createAuthedSupabaseClient();
    const { data: stateRow } = await supabase
      .from("dashboard_state")
      .select("data")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const raw = stateRow?.data;
    if (isPersistedDashboardSnapshot(raw)) {
      const state = mergeWithDefaults(raw as Partial<DashboardState>);
      await migrateProfileFromDashboard(supabase, auth.user.id, state);
    }

    const [profile, insurancePolicies, ilpPolicies] = await Promise.all([
      loadFinanceProfile(supabase, auth.user.id),
      loadInsurancePolicies(supabase, auth.user.id),
      loadIlpPolicies(supabase, auth.user.id),
    ]);

    return NextResponse.json({
      configured: true,
      profile,
      insurancePolicies,
      ilpPolicies,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load profile";
    console.error("[api/profile] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: {
    profile?: Partial<ReturnType<typeof profileFromState>>;
    insurancePolicies?: DashboardState["insurancePolicies"];
    ilpPolicies?: DashboardState["ilpPolicies"];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    if (body.profile) {
      await saveFinanceProfile(supabase, auth.user.id, body.profile);
    }
    if (body.insurancePolicies) {
      await saveInsurancePolicies(supabase, auth.user.id, body.insurancePolicies);
    }
    if (body.ilpPolicies) {
      await saveIlpPolicies(supabase, auth.user.id, body.ilpPolicies);
    }

    const [profile, insurancePolicies, ilpPolicies] = await Promise.all([
      loadFinanceProfile(supabase, auth.user.id),
      loadInsurancePolicies(supabase, auth.user.id),
      loadIlpPolicies(supabase, auth.user.id),
    ]);

    return NextResponse.json({
      configured: true,
      profile,
      insurancePolicies,
      ilpPolicies,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save profile";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
