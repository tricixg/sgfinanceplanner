import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadIncomeCategories, saveIncomeCategories } from "@/lib/income/load";
import type { IncomeCategoryInput } from "@/lib/income/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, categories: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const categories = await loadIncomeCategories(supabase, user.id);
    console.info("[api/income-categories] GET", { userId: user.id, count: categories.length });
    return NextResponse.json({ configured: true, categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load income categories";
    console.error("[api/income-categories] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { categories?: IncomeCategoryInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = body.categories;
  if (!Array.isArray(incoming)) {
    return NextResponse.json({ error: "categories array required" }, { status: 400 });
  }

  try {
    const supabase = await createAuthedSupabaseClient();
    const categories = await saveIncomeCategories(supabase, user.id, incoming);
    console.info("[api/income-categories] PUT ok", { userId: user.id, count: categories.length });
    return NextResponse.json({ categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save income categories";
    console.error("[api/income-categories] PUT failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
