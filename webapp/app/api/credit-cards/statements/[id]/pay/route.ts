import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  recordCardStatementPayment,
  undoCardStatementPayment,
} from "@/lib/credit-cards/card-statements/pay";
import { loadCreditCards } from "@/lib/credit-cards/load";
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
    const { data: stmtRow, error: stmtErr } = await supabase
      .from("card_statements")
      .select("credit_card_id")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (stmtErr) throw new Error(stmtErr.message);
    if (!stmtRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cards = await loadCreditCards(supabase, auth.user.id);
    const card = cards.find((c) => c.id === stmtRow.credit_card_id);
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await recordCardStatementPayment(
      supabase,
      auth.user.id,
      card,
      id,
      amount,
      financialAccountId
    );

    console.info("[api/credit-cards/statements] POST pay", { id, amount });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payment failed";
    console.error("[api/credit-cards/statements] POST pay failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    const { data: stmtRow, error: stmtErr } = await supabase
      .from("card_statements")
      .select("credit_card_id")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (stmtErr) throw new Error(stmtErr.message);
    if (!stmtRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const cards = await loadCreditCards(supabase, auth.user.id);
    const card = cards.find((c) => c.id === stmtRow.credit_card_id);
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    await undoCardStatementPayment(supabase, auth.user.id, card, id);
    console.info("[api/credit-cards/statements] DELETE pay", { id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Undo payment failed";
    console.error("[api/credit-cards/statements] DELETE pay failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
