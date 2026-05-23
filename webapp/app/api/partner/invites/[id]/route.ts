import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const { id } = await params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;
  if (!action || !["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = await createAuthedSupabaseClient();
  const { data: invite, error: invErr } = await supabase
    .from("partner_invites")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (invErr || !invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.status !== "pending") {
    return NextResponse.json({ error: "Invite is no longer pending" }, { status: 409 });
  }

  const userEmail = user.email?.toLowerCase() ?? "";
  const isInviter = invite.inviter_id === user.id;
  const isInvitee =
    userEmail && invite.invitee_email.toLowerCase() === userEmail;

  if (action === "cancel") {
    if (!isInviter) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase
      .from("partner_invites")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", id);
    console.info("[api/partner/invites] cancelled", { id, userId: user.id });
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (!isInvitee) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await supabase
      .from("partner_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", id);
    console.info("[api/partner/invites] declined", { id, userId: user.id });
    return NextResponse.json({ ok: true });
  }

  if (!isInvitee) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existingMembers } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const oldHouseholdId = existingMembers?.household_id;

  const { error: delMemErr } = await supabase
    .from("household_members")
    .delete()
    .eq("user_id", user.id);

  if (delMemErr) {
    console.error("[api/partner/invites] remove old membership failed", delMemErr.message);
    return NextResponse.json({ error: delMemErr.message }, { status: 500 });
  }

  const { error: joinErr } = await supabase.from("household_members").insert({
    household_id: invite.household_id,
    user_id: user.id,
    role: "member",
  });

  if (joinErr) {
    console.error("[api/partner/invites] join household failed", joinErr.message);
    if (oldHouseholdId) {
      await ensureUserHousehold(supabase, user.id);
    }
    return NextResponse.json({ error: joinErr.message }, { status: 500 });
  }

  if (oldHouseholdId && oldHouseholdId !== invite.household_id) {
    const { count } = await supabase
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", oldHouseholdId);
    if ((count ?? 0) === 0) {
      await supabase.from("households").delete().eq("id", oldHouseholdId);
      console.info("[api/partner/invites] removed empty solo household", {
        oldHouseholdId,
      });
    }
  }

  await supabase
    .from("partner_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", id);

  await supabase
    .from("partner_invites")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("inviter_id", user.id)
    .eq("status", "pending");

  console.info("[api/partner/invites] accepted", {
    id,
    userId: user.id,
    householdId: invite.household_id,
  });

  return NextResponse.json({ ok: true, householdId: invite.household_id });
}
