import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadBudgetLines, saveBudgetLines } from "@/lib/budget/load";
import type { BudgetItem } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, budget: [] });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  try {
    const supabase = await createAuthedSupabaseClient();
    const budget = await loadBudgetLines(supabase, auth.user.id);
    return NextResponse.json({ configured: true, budget });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load budget";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }
  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  let body: { budget?: BudgetItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const supabase = await createAuthedSupabaseClient();
    const budget = await saveBudgetLines(supabase, auth.user.id, body.budget ?? []);
    return NextResponse.json({ configured: true, budget });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save budget";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
