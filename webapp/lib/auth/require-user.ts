import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function getSessionUser(): Promise<User | null> {
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
