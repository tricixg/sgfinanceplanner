import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { mapInvite } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function POST(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  if (user.email?.toLowerCase() === email) {
    return NextResponse.json({ error: "Cannot invite yourself" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  if ((members?.length ?? 0) > 1) {
    return NextResponse.json(
      { error: "Already paired with a partner" },
      { status: 409 }
    );
  }

  const { data: row, error } = await supabase
    .from("partner_invites")
    .insert({
      household_id: householdId,
      inviter_id: user.id,
      invitee_email: email,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[api/partner/invites] POST failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.info("[api/partner/invites] invite sent", {
    inviterId: user.id,
    inviteeEmail: email,
    householdId,
  });

  return NextResponse.json({ invite: mapInvite(row) });
}
