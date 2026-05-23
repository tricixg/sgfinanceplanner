import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadAdditiveIncomeByYm } from "@/lib/income/deposits-by-month";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, byYm: {} });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { searchParams } = new URL(req.url);
  const startYm = searchParams.get("startYm");
  const count = Math.min(24, Math.max(1, parseInt(searchParams.get("count") ?? "5", 10) || 5));

  if (!startYm || !/^\d{4}-\d{2}$/.test(startYm)) {
    return NextResponse.json({ error: "startYm required (YYYY-MM)" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const byYm = await loadAdditiveIncomeByYm(supabase, user.id, startYm, count);
    console.info("[api/cashflow/additive-income] GET", { userId: user.id, startYm, count });
    return NextResponse.json({ configured: true, byYm });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load additive income";
    console.error("[api/cashflow/additive-income] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
