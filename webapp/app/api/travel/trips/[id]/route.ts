import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadTrip, updateTrip, deleteTrip } from "@/lib/travel/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, item: null });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  const item = await loadTrip(supabase, auth.user.id, id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  let body: {
    name?: string;
    country?: string;
    startDate?: string;
    endDate?: string;
    status?: "planned" | "ongoing" | "completed";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const supabase = await createAuthedSupabaseClient();
  const prev = await loadTrip(supabase, auth.user.id, id);
  if (!prev) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const item = await updateTrip(supabase, auth.user.id, id, body);

  if (body.name && body.name.trim() && body.name.trim() !== prev.name) {
    const prefixOld = `${prev.name} - `;
    const prefixNew = `${item.name} - `;
    const { data: rows, error } = await supabase
      .from("expenses")
      .select("id, note")
      .eq("user_id", auth.user.id)
      .eq("category", "Travel")
      .gte("spent_at", prev.startDate)
      .lte("spent_at", prev.endDate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of rows ?? []) {
      const note = String(row.note ?? "");
      if (!note.startsWith(prefixOld)) continue;
      await supabase
        .from("expenses")
        .update({ note: `${prefixNew}${note.slice(prefixOld.length)}`, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", auth.user.id);
    }
  }

  return NextResponse.json({ item });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const supabase = await createAuthedSupabaseClient();
  await deleteTrip(supabase, auth.user.id, id);
  return NextResponse.json({ ok: true });
}
