import { apiError } from "@/lib/api/api-error";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteHoldingDividend } from "@/lib/holdings/dividends";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

type Params = { params: Promise<{ id: string; dividendId: string }> };

export const DELETE = withRequestId(async function DELETE(_req: Request, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id: holdingId, dividendId } = await params;

  const supabase = await createAuthedSupabaseClient();
  const { data: holding } = await supabase
    .from("holdings")
    .select("user_id")
    .eq("id", holdingId)
    .maybeSingle();

  if (!holding || holding.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteHoldingDividend(supabase, { userId: user.id, holdingId, dividendId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete dividend";
    console.error("[api/holdings/dividends] DELETE failed", msg);
    return apiError("api/holdings/[id]/dividends/[dividendId]", msg, { fallback: "Failed to delete dividend" });
  }
});
