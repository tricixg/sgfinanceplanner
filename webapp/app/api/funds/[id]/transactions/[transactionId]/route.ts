import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteFundTransaction } from "@/lib/funds/ledger";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string; transactionId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: fundId, transactionId } = await params;

  const supabase = await createAuthedSupabaseClient();
  const { data: fund } = await supabase
    .from("investment_funds")
    .select("user_id")
    .eq("id", fundId)
    .maybeSingle();

  if (!fund || fund.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteFundTransaction(supabase, user.id, fundId, transactionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete transaction";
    console.error("[api/funds/transactions] DELETE failed", msg);
    const status = msg === "Transaction not found" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
