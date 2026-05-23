import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { unlinkPartner } from "@/lib/household/unlink-partner";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server missing SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  try {
    const result = await unlinkPartner(admin, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to unlink partner";
    const status =
      msg === "Not in a household" || msg === "No partner linked" ? 409 : 500;
    console.error("[api/partner/unlink] failed", { userId: user.id, msg });
    return NextResponse.json({ error: msg }, { status });
  }
}
