import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { verifyFinancialAccount } from "@/lib/expenses/auto-payment";
import { mapPokerSession } from "@/lib/poker/db-mappers";
import { reversePokerLedger } from "@/lib/poker/ledger-sync";
import { type PokerSessionBody, updatePokerSession } from "@/lib/poker/save-session";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

type Params = { params: Promise<{ id: string }> };

export const GET = withRequestId(async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();
  const { data, error } = await supabase
    .from("poker_sessions")
    .select("*, poker_games(*)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[api/poker] GET failed", error.message);
    return apiError("api/poker/[id]", error);
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  console.info("[api/poker] GET ok", { id, userId: user.id });
  return NextResponse.json({ item: mapPokerSession(data) });
});

export const PATCH = withRequestId(async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  let body: PokerSessionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();

  if (body.financialAccountId) {
    const acctOk = await verifyFinancialAccount(
      supabase,
      user.id,
      body.financialAccountId
    );
    if (!acctOk) {
      return NextResponse.json({ error: "Invalid financial account" }, { status: 400 });
    }
  }

  const result = await updatePokerSession(supabase, user.id, id, body);
  if ("error" in result) {
    const status =
      result.error === "Not found" ? 404 : result.error.includes("Ledger") ? 500 : 400;
    return apiError("api/poker/[id]", result.error, { status });
  }

  console.info("[api/poker] PATCH ok", { id, userId: user.id });
  return NextResponse.json({ item: result.session });
});

export const DELETE = withRequestId(async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const supabase = await createAuthedSupabaseClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("poker_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error("[api/poker] DELETE fetch failed", fetchErr.message);
    return apiError("api/poker/[id]", fetchErr);
  }
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = mapPokerSession(existing);

  try {
    await reversePokerLedger(supabase, user.id, session);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ledger reversal failed";
    console.error("[api/poker] DELETE ledger reverse failed", msg);
    return apiError("api/poker/[id]", msg, { fallback: "Ledger reversal failed" });
  }

  const { error } = await supabase
    .from("poker_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[api/poker] DELETE failed", error.message);
    return apiError("api/poker/[id]", error);
  }

  console.info("[api/poker] DELETE ok", { id, userId: user.id });
  return NextResponse.json({ ok: true });
});
