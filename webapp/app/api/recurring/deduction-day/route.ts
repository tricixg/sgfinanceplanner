import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { updateRecurringDeductionDay } from "@/lib/recurring/load";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function PATCH(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: {
    kind?: string;
    sourceId?: string;
    deductionDay?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind;
  if (
    kind !== "debt" &&
    kind !== "insurance" &&
    kind !== "ilp" &&
    kind !== "subscription"
  ) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (!body.sourceId) {
    return NextResponse.json({ error: "sourceId required" }, { status: 400 });
  }

  const day = body.deductionDay;
  if (day != null && (typeof day !== "number" || day < 1 || day > 31)) {
    return NextResponse.json({ error: "deductionDay must be 1–31 or null" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  try {
    await updateRecurringDeductionDay(
      supabase,
      user.id,
      kind,
      body.sourceId,
      day ?? null
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    console.error("[api/recurring/deduction-day] failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
