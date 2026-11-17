import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { saveAccountsConfig } from "@/lib/savings/save-accounts";
import { saveErrorStatus } from "@/lib/sync/save-error";
import { loadAccountsBundle } from "@/lib/savings/load-accounts";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import type { UserSavingsAccount } from "@/lib/savings/types";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, accounts: [], totals: null });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  try {
    const supabase = await createAuthedSupabaseClient();
    const bundle = await loadAccountsBundle(supabase, user.id);
    return NextResponse.json({ configured: true, ...bundle });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load accounts";
    console.error("[api/accounts] GET failed", msg);
    return apiError("api/accounts", msg, { fallback: "Failed to load accounts" });
  }
}

/** `deletedIds` are the only rows ever deleted; omission from `accounts` never deletes. */
type PutBody = { accounts?: Partial<UserSavingsAccount>[]; deletedIds?: string[] };

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

  const supabase = await createAuthedSupabaseClient();
  const incoming = body.accounts ?? [];

  try {
    await saveAccountsConfig(supabase, user.id, incoming, body.deletedIds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save accounts";
    console.error("[api/accounts] PUT failed", msg);
    return apiError("api/accounts", msg, { status: saveErrorStatus(e), fallback: "Failed to save accounts" });
  }

  console.info("[api/accounts] PUT ok", { userId: user.id, count: incoming.length });
  const bundle = await loadAccountsBundle(supabase, user.id);
  return NextResponse.json({ configured: true, ...bundle });
}
