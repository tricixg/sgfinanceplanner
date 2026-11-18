import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { addCpfContribution, listCpfContributions } from "@/lib/cpf/contributions";
import { parseClientRequestId } from "@/lib/api/idempotency";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const limit = Math.min(
    120,
    Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") ?? "60", 10) || 60)
  );

  try {
    const supabase = await createAuthedSupabaseClient();
    const items = await listCpfContributions(supabase, auth.user.id, limit);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load CPF contributions";
    return apiError("api/cpf/contributions", msg, { fallback: "Failed to load CPF contributions" });
  }
}

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  let body: {
    month?: string;
    oa?: number;
    sa?: number;
    ma?: number;
    note?: string;
    creditedOn?: string;
    /** Idempotency key, one per submit; a retry returns the original row. */
    clientRequestId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  const clientRequestId = parseClientRequestId(body.clientRequestId);
  if (clientRequestId && typeof clientRequestId === "object") {
    return NextResponse.json({ error: clientRequestId.error }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const result = await addCpfContribution(supabase, auth.user.id, {
      month: body.month,
      oa: Number(body.oa ?? 0),
      sa: Number(body.sa ?? 0),
      ma: Number(body.ma ?? 0),
      note: body.note,
      creditedOn: body.creditedOn ?? null,
      clientRequestId,
    });
    console.info("[api/cpf/contributions] POST ok", {
      userId: auth.user.id,
      month: body.month,
    });
    return NextResponse.json({ item: result.contribution, profile: result.profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to log CPF contribution";
    return apiError("api/cpf/contributions", msg, { status: 400, fallback: "Failed to log CPF contribution" });
  }
}
