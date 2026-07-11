import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSessionUser } from "@/lib/auth/require-user";

export async function POST(req: NextRequest) {
  const authResult = await requireSessionUser();
  if ("response" in authResult) return authResult.response;

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { has_password: true },
  });

  if (error) {
    console.warn("[api/auth/password] updateUser error", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.info("[api/auth/password] password updated", { userId: authResult.user.id });
  return NextResponse.json({ ok: true });
}
