import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOtherLoanPayments } from "@/lib/other-loans/payment-history";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    const { data: loanRow, error: loanErr } = await supabase
      .from("other_loans")
      .select("id, name, loan_type")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (loanErr) throw new Error(loanErr.message);
    if (!loanRow) {
      return NextResponse.json({ error: "Loan not found" }, { status: 404 });
    }
    if (loanRow.loan_type === "balance_transfer") {
      return NextResponse.json(
        { error: "Balance transfer payments are tracked on Credit Cards" },
        { status: 400 }
      );
    }

    const payments = await loadOtherLoanPayments(supabase, auth.user.id, id);

    console.info("[api/other-loans] GET payments", { id, count: payments.length });
    return NextResponse.json({ payments });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load payments";
    console.error("[api/other-loans] GET payments failed", { id, msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
