import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadLoans, saveLoans } from "@/lib/loans/load";
import type { Loan } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, loans: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    const loans = await loadLoans(supabase, auth.user.id);
    return NextResponse.json({ configured: true, loans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load loans";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let body: { loans?: Loan[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const supabase = await createAuthedSupabaseClient();
    const loans = await saveLoans(supabase, auth.user.id, body.loans ?? []);
    return NextResponse.json({ configured: true, loans });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save loans";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
