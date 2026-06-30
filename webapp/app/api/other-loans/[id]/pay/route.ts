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
    const { data: loanRow, error: loanErr } = await supabase
      .from("other_loans")
      .select("loan_type")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (loanErr) throw new Error(loanErr.message);
    if (!loanRow) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }
    if (loanRow.loan_type === "balance_transfer") {
      return NextResponse.json(
        { error: "Balance transfer is paid from Credit Cards statement payment" },
        { status: 400 }
      );
    }
    await recordOtherLoanPayment(
      supabase,
      auth.user.id,
      id,
      amount,
      financialAccountId,
      note
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
