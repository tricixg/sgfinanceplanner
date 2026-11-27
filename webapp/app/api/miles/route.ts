import { apiError } from "@/lib/api/api-error";
import { isPublicMessage } from "@/lib/api/public-messages";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { applyMilesAction } from "@/lib/miles/ledger";
import { loadMilesBundle } from "@/lib/miles/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

export const GET = withRequestId(async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, lots: [], activity: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadMilesBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    console.error("[api/miles] GET failed", e instanceof Error ? e.message : e);
    return apiError("api/miles", e, { fallback: "Failed to load miles" });
  }
});

/** One change (log points, convert, redeem, undo, delete); returns the refreshed bundle. */
export const POST = withRequestId(async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    const result = await applyMilesAction(supabase, user.id, body);
    console.info("[api/miles] POST ok", { userId: user.id, action: body.action });
    const bundle = await loadMilesBundle(supabase, user.id);
    return NextResponse.json({ configured: true, result, ...bundle });
  } catch (e) {
    console.error("[api/miles] POST failed", { action: body.action, message: e instanceof Error ? e.message : e });
    // Refusals from the ledger ("Convert in blocks of…") are the user's to fix; anything else is ours.
    const status = e instanceof Error && isPublicMessage(e.message) ? 400 : 500;
    return apiError("api/miles", e, { status, fallback: "Couldn't save that change to your miles" });
  }
});
