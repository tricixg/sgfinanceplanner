import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteOncallPayment, loadOncallBundle } from "@/lib/oncall/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    await deleteOncallPayment(supabase, user.id, id);
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete payment";
    console.error("[api/oncall/payments] DELETE failed", msg);
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 400 });
  }
}
