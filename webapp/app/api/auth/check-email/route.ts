import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ isKnownUser: false, hasPassword: false });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ isKnownUser: false, hasPassword: false });
  }

  try {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) {
      console.warn("[api/auth/check-email] listUsers error", error.message);
      return NextResponse.json({ isKnownUser: false, hasPassword: false });
    }
    const user = (data?.users ?? []).find((u) => u.email?.toLowerCase() === email);
    const isKnownUser = Boolean(user);
    const hasPassword = Boolean(user?.user_metadata?.has_password);
    console.info("[api/auth/check-email] checked", { email, isKnownUser, hasPassword });
    return NextResponse.json({ isKnownUser, hasPassword });
  } catch (e) {
    console.error("[api/auth/check-email] unexpected error", e);
    return NextResponse.json({ isKnownUser: false, hasPassword: false });
  }
}
