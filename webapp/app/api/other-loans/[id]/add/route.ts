import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOtherLoans } from "@/lib/other-loans/load";
import { addToOtherLoan } from "@/lib/other-loans/pay";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let body: { amount?: number; financialAccountId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { amount, financialAccountId, note } = body;
  if (amount == null || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await addToOtherLoan(supabase, auth.user.id, id, amount, financialAccountId, note);
    const otherLoans = await loadOtherLoans(supabase, auth.user.id);
    console.info("[api/other-loans] POST add", { id, amount });
    return NextResponse.json({ ok: true, otherLoans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record draw-down";
    console.error("[api/other-loans] POST add failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
