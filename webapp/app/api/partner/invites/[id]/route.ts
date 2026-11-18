import { apiError } from "@/lib/api/api-error";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { acceptPartnerInvite } from "@/lib/household/accept-invite";
import { saveErrorStatus } from "@/lib/sync/save-error";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { withRequestId } from "@/lib/api/with-request-id";

type Params = { params: Promise<{ id: string }> };

export const POST = withRequestId(async function POST(req: NextRequest, { params }: Params) {
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

  // Membership changes are only possible through this SQL function (migration 066):
  // it re-validates the invite, enforces the 2-member cap and runs atomically.
  let householdId: string;
  try {
    householdId = await acceptPartnerInvite(supabase, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to accept invite";
    console.error("[api/partner/invites] accept failed", msg);
    return apiError("api/partner/invites/[id]", msg, { status: saveErrorStatus(e), fallback: "Failed to accept invite" });
  }

  console.info("[api/partner/invites] accepted", {
    id,
    userId: user.id,
    householdId,
  });

  return NextResponse.json({ ok: true, householdId });
});
