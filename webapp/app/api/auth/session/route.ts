import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/require-user";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  const configured = isSupabaseAuthConfigured();
  if (!configured) {
    console.info("[api/auth/session] GET — auth not configured");
    return NextResponse.json({ configured: false, user: null });
  }

  const user = await getSessionUser();
  console.info("[api/auth/session] GET", {
    configured: true,
    signedIn: Boolean(user),
    userId: user?.id ?? null,
  });

  return NextResponse.json({
    configured: true,
    user: user
      ? { id: user.id, email: user.email ?? null }
      : null,
  });
}
