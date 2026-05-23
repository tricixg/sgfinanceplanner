import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadOtherLoans, saveOtherLoans } from "@/lib/other-loans/load";
import type { OtherLoan } from "@/lib/other-loans/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, otherLoans: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    const otherLoans = await loadOtherLoans(supabase, auth.user.id);
    return NextResponse.json({ configured: true, otherLoans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load other loans";
    console.error("[api/other-loans] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let body: { otherLoans?: OtherLoan[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const supabase = await createAuthedSupabaseClient();
    const otherLoans = await saveOtherLoans(
      supabase,
      auth.user.id,
      body.otherLoans ?? []
    );
    return NextResponse.json({ configured: true, otherLoans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save other loans";
    console.error("[api/other-loans] PUT failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
