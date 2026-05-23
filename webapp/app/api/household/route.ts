import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { ensureUserHousehold } from "@/lib/household/bootstrap";
import { enrichInviterEmails, lookupUserEmails } from "@/lib/household/invite-emails";
import { mapInvite } from "@/lib/savings/db-mappers";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export async function GET() {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const { user } = auth;

  const supabase = await createAuthedSupabaseClient();
  const householdId = await ensureUserHousehold(supabase, user.id);

  const { data: members, error: memErr } = await supabase
    .from("household_members")
    .select("user_id, role, joined_at")
    .eq("household_id", householdId);

  if (memErr) {
    console.error("[api/household] members failed", memErr.message);
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  const { data: sentInvites } = await supabase
    .from("partner_invites")
    .select("*")
    .eq("inviter_id", user.id)
    .in("status", ["pending", "accepted", "declined", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(20);

  const email = user.email?.toLowerCase() ?? "";
  const { data: receivedInvites } = email
    ? await supabase
        .from("partner_invites")
        .select("*")
        .eq("status", "pending")
        .ilike("invitee_email", email)
        .order("created_at", { ascending: false })
    : { data: [] };

  const paired = (members?.length ?? 0) > 1;

  const memberRows = (members ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.joined_at,
    isYou: m.user_id === user.id,
    email: null as string | null,
  }));
  const memberEmails = await lookupUserEmails(memberRows.map((m) => m.userId));
  const membersWithEmail = memberRows.map((m) => ({
    ...m,
    email: memberEmails.get(m.userId) ?? null,
  }));

  const sent = await enrichInviterEmails((sentInvites ?? []).map((r) => mapInvite(r)));
  const received = await enrichInviterEmails(
    (receivedInvites ?? []).map((r) => mapInvite(r))
  );

  console.info("[api/household] GET", {
    userId: user.id,
    householdId,
    paired,
    members: members?.length ?? 0,
    receivedPending: received.length,
  });

  return NextResponse.json({
    configured: true,
    householdId,
    paired,
    members: membersWithEmail,
    sentInvites: sent,
    receivedInvites: received,
  });
}
