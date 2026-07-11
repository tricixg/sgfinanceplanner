import { NextResponse } from "next/server";
import {
  getDevBypassEmail,
  getDevBypassUserId,
  isDevAuthBypass,
} from "@/lib/auth/dev-bypass";
import { getSessionUser } from "@/lib/auth/require-user";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (isDevAuthBypass()) {
    const id = getDevBypassUserId();
    console.info("[api/auth/session] GET — dev bypass", { userId: id ?? null });
    return NextResponse.json({
      configured: true,
      bypass: true,
      user: id
        ? { id, email: getDevBypassEmail() ?? "dev-bypass@local" }
        : null,
    });
  }

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
      ? {
          id: user.id,
          email: user.email ?? null,
          hasPassword: Boolean(user.user_metadata?.has_password),
        }
      : null,
  });
}
