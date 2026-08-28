import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import {
  getDevBypassEmail,
  getDevBypassUserId,
  isDevAuthBypass,
} from "@/lib/auth/dev-bypass";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { TRUSTED_USER_HEADER, decodeTrustedUser } from "@/lib/auth/trusted-header";

function devBypassUser(): User | null {
  const id = getDevBypassUserId();
  if (!id) return null;
  console.info("[auth] dev bypass user", { userId: id });
  return {
    id,
    email: getDevBypassEmail() ?? "dev-bypass@local",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

async function trustedHeaderUser(): Promise<User | null> {
  const headerStore = await headers();
  const trusted = decodeTrustedUser(headerStore.get(TRUSTED_USER_HEADER));
  if (!trusted) return null;
  return {
    id: trusted.id,
    email: trusted.email,
    app_metadata: {},
    user_metadata: { has_password: trusted.hasPassword },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

export async function getSessionUser(): Promise<User | null> {
  if (isDevAuthBypass()) {
    return devBypassUser();
  }
  if (!isSupabaseAuthConfigured()) return null;

  // Middleware already verified this request's JWT against Supabase Auth and forwarded the
  // result — trust it instead of paying for a second network round-trip here. Falls through
  // to a live check only if the header is missing (a request that somehow bypassed
  // middleware), so there's no security downgrade either way.
  const fromHeader = await trustedHeaderUser();
  if (fromHeader) return fromHeader;

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
            "AUTH_BYPASS_DEV is set but DEV_USER_ID is missing. Add your Supabase user UUID (and DEV_USER_EMAIL for partner invites) to .env.local.",
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
