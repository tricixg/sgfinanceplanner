import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

/**
 * Shared BTO planner scenario (project name, flat price, grants, loan terms,
 * timeline) — one row per household, RLS-gated to household members, so both
 * linked partners read/write the same numbers. See
 * supabase/migrations/048_household_bto_planner.sql.
 */
export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, data: null });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, auth.user.id);

  const { data, error } = await supabase
    .from("household_bto_planner")
    .select("data")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    console.error("[api/household/bto-planner] GET failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configured: true, data: data?.data ?? null });
}

export async function PATCH(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: { data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object") {
    return NextResponse.json({ error: "data required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, auth.user.id);

  const { data, error } = await supabase
    .from("household_bto_planner")
    .upsert({
      household_id: householdId,
      data: body.data,
      updated_at: new Date().toISOString(),
    })
    .select("data")
    .single();

  if (error) {
    console.error("[api/household/bto-planner] PATCH failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/household/bto-planner] saved", { householdId });
  return NextResponse.json({ data: data.data });
}
