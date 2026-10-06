import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadBenefitClaims, recordBenefitClaim, verifyBenefit } from "@/lib/benefits/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    const benefit = await verifyBenefit(supabase, user.id, id);
    if (!benefit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const claims = await loadBenefitClaims(supabase, user.id, [id]);
    return NextResponse.json({ claims });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load claims";
    console.error("[api/benefits/claims] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  let body: { amount?: number; claimedAt?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount ?? 0);
  if (!(amount > 0)) {
    return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const benefit = await verifyBenefit(supabase, user.id, id);
    if (!benefit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const claim = await recordBenefitClaim(supabase, user.id, {
      benefitId: id,
      amount,
      claimedAt: body.claimedAt,
      note: body.note,
    });
    return NextResponse.json({ claim });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to log claim";
    console.error("[api/benefits/claims] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
