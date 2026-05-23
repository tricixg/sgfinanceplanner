import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { updateStatementFields } from "@/lib/credit-cards/card-statements/load";
import { loadCreditCards } from "@/lib/credit-cards/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let body: { actualAmount?: number; minimumDue?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hasActual = body.actualAmount != null;
  const hasMinDue = body.minimumDue !== undefined;
  if (!hasActual && !hasMinDue) {
    return NextResponse.json(
      { error: "actualAmount and/or minimumDue required" },
      { status: 400 }
    );
  }

  if (
    hasActual &&
    (!Number.isFinite(body.actualAmount) || (body.actualAmount ?? 0) < 0)
  ) {
    return NextResponse.json({ error: "Invalid actualAmount" }, { status: 400 });
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

    const statement = await updateStatementFields(supabase, auth.user.id, id, {
      ...(hasActual ? { actualAmount: body.actualAmount } : {}),
      ...(hasMinDue ? { minimumDue: body.minimumDue ?? null } : {}),
    }, card);

    console.info("[api/credit-cards/statements] PATCH", {
      id,
      actualAmount: body.actualAmount,
      minimumDue: body.minimumDue,
    });
    return NextResponse.json({ statement });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update statement";
    console.error("[api/credit-cards/statements] PATCH failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
