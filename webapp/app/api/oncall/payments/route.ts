import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createOncallPayment, loadOncallBundle } from "@/lib/oncall/load";
import type { OncallPaymentInput } from "@/lib/oncall/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: OncallPaymentInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const payment = await createOncallPayment(supabase, user.id, body);
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json({ payment, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to record payment";
    console.error("[api/oncall/payments] POST failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
