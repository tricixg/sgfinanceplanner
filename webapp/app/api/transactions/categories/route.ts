import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { loadDistinctTransactionCategories } from "@/lib/transactions/category-filter";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, categories: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;

  const supabase = await createAuthedSupabaseClient();
  try {
    const categories = await loadDistinctTransactionCategories(supabase, auth.user.id);
    return NextResponse.json({ configured: true, categories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load categories";
    console.error("[api/transactions/categories] GET failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
