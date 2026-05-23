import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import {
  loadRecurringSubscriptions,
  saveRecurringSubscriptions,
} from "@/lib/recurring/load";
import type { RecurringSubscription } from "@/lib/types";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const items = await loadRecurringSubscriptions(supabase, user.id);
  return NextResponse.json({ configured: true, items });
}

export async function PUT(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { items?: RecurringSubscription[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items array required" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const items = await saveRecurringSubscriptions(supabase, user.id, body.items);
  console.info("[api/recurring-subscriptions] PUT", { userId: user.id, count: items.length });
  return NextResponse.json({ items });
}
