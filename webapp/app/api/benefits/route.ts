import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadBenefitUsage, saveBenefits } from "@/lib/benefits/load";
import type { BenefitInput } from "@/lib/benefits/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, benefits: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const benefits = await loadBenefitUsage(supabase, user.id);
    console.info("[api/benefits] GET", { userId: user.id, count: benefits.length });
    return NextResponse.json({ configured: true, benefits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load benefits";
    console.error("[api/benefits] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PutBody = { benefits?: BenefitInput[] };

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = body.benefits;
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "benefits array required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    await saveBenefits(supabase, user.id, incoming);
    const benefits = await loadBenefitUsage(supabase, user.id);
    console.info("[api/benefits] PUT ok", { userId: user.id, count: benefits.length });
    return NextResponse.json({ benefits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save benefits";
    console.error("[api/benefits] PUT failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
