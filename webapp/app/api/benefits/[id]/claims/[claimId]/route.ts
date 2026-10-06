import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteBenefitClaim, updateBenefitClaim, verifyBenefit } from "@/lib/benefits/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string; claimId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id, claimId } = await params;

  let body: { amount?: number; claimedAt?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const benefit = await verifyBenefit(supabase, user.id, id);
    if (!benefit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const claim = await updateBenefitClaim(supabase, user.id, claimId, {
      amount: body.amount,
      claimedAt: body.claimedAt,
      note: body.note,
    });
    return NextResponse.json({ claim });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update claim";
    console.error("[api/benefits/claims] PATCH failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id, claimId } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    const benefit = await verifyBenefit(supabase, user.id, id);
    if (!benefit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await deleteBenefitClaim(supabase, user.id, claimId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete claim";
    console.error("[api/benefits/claims] DELETE failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
