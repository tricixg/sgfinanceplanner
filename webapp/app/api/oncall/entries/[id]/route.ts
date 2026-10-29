import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteOncallEntry, loadOncallBundle, updateOncallEntry } from "@/lib/oncall/load";
import type { OncallEntryInput } from "@/lib/oncall/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;
  const { id } = await params;

  let body: OncallEntryInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await updateOncallEntry(supabase, user.id, id, body);
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update on-call stretch";
    console.error("[api/oncall/entries] PATCH failed", msg);
    return NextResponse.json({ error: msg }, { status: msg === "Not found" ? 404 : 400 });
  }
}

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
    await deleteOncallEntry(supabase, user.id, id);
    const bundle = await loadOncallBundle(supabase, user.id);
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete on-call stretch";
    console.error("[api/oncall/entries] DELETE failed", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
