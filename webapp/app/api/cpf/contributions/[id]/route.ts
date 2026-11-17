import { apiError } from "@/lib/api/api-error";
import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { deleteCpfContribution, updateCpfContribution } from "@/lib/cpf/contributions";
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
    const profile = await deleteCpfContribution(supabase, auth.user.id, id);
    console.info("[api/cpf/contributions] DELETE ok", { userId: auth.user.id, id });
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete CPF contribution";
    return apiError("api/cpf/contributions/[id]", msg, { status: 400, fallback: "Failed to delete CPF contribution" });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  let body: { month?: string; oa?: number; sa?: number; ma?: number; note?: string; creditedOn?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.month) return NextResponse.json({ error: "month required" }, { status: 400 });

  try {
    const supabase = await createAuthedSupabaseClient();
    const result = await updateCpfContribution(supabase, auth.user.id, id, {
      month: body.month,
      oa: Number(body.oa ?? 0),
      sa: Number(body.sa ?? 0),
      ma: Number(body.ma ?? 0),
      note: body.note,
      creditedOn: body.creditedOn ?? null,
    });
    console.info("[api/cpf/contributions] PATCH ok", { userId: auth.user.id, id });
    return NextResponse.json({ item: result.contribution, profile: result.profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to update CPF contribution";
    return apiError("api/cpf/contributions/[id]", msg, { status: 400, fallback: "Failed to update CPF contribution" });
  }
}
