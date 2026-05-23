import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getDevBypassUserId, isDevAuthBypass } from "@/lib/auth/dev-bypass";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

function devBypassUser(): User | null {
  const id = getDevBypassUserId();
  if (!id) return null;
  console.info("[auth] dev bypass user", { userId: id });
  return {
    id,
    email: "dev-bypass@local",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

export async function getSessionUser(): Promise<User | null> {
  if (isDevAuthBypass()) {
    return devBypassUser();
  }
  if (!isSupabaseAuthConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.warn("[auth] getUser failed", error.message);
    return null;
  }
  return user;
}

export async function requireSessionUser(): Promise<
  { user: User } | { response: NextResponse }
> {
  if (isDevAuthBypass()) {
    const user = devBypassUser();
    if (user) return { user };
    return {
      response: NextResponse.json(
        {
          error:
            "AUTH_BYPASS_DEV is set but DEV_USER_ID is missing. Add your Supabase user UUID to .env.local.",
        },
        { status: 503 }
      ),
    };
  }

  if (!isSupabaseAuthConfigured()) {
    return {
      response: NextResponse.json(
        { error: "Supabase auth not configured" },
        { status: 503 }
      ),
    };
  }

  const user = await getSessionUser();
  if (!user) {
    return {
      response: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
    };
  }

  return { user };
}
