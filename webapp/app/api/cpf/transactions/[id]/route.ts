import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteCpfTransaction } from "@/lib/cpf/transactions";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  try {
    const supabase = await createAuthedSupabaseClient();
    const { oa } = await deleteCpfTransaction(supabase, auth.user.id, id);
    console.info("[api/cpf/transactions] DELETE ok", { userId: auth.user.id, id });
    return NextResponse.json({ ok: true, oa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete CPF transaction";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
