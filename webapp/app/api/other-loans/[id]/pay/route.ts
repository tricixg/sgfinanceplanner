import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOtherLoans } from "@/lib/other-loans/load";
import { recordOtherLoanPayment } from "@/lib/other-loans/pay";
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

  let body: { amount?: number; financialAccountId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { amount, financialAccountId } = body;
  if (
    amount == null ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !financialAccountId
  ) {
    return NextResponse.json(
      { error: "amount and financialAccountId required" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await recordOtherLoanPayment(
      supabase,
      auth.user.id,
      id,
      amount,
      financialAccountId
    );
  const otherLoans = await loadOtherLoans(supabase, auth.user.id);
    console.info("[api/other-loans] POST pay", { id, amount });
    return NextResponse.json({ ok: true, otherLoans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment failed";
    console.error("[api/other-loans] POST pay failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
