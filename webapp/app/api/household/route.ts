import { apiError } from "@/lib/api/api-error";
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
  const email = user.email?.toLowerCase() ?? "";

  // The invite lists don't depend on the household id, so they load alongside it.
  const [householdId, { data: sentInvites }, { data: receivedInvites }] = await Promise.all([
    ensureUserHousehold(supabase, user.id),
    supabase
      .from("partner_invites")
      .select("*")
      .eq("inviter_id", user.id)
      .in("status", ["pending", "accepted", "declined", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(20),
    email
      ? supabase
          .from("partner_invites")
          .select("*")
          .eq("status", "pending")
          .ilike("invitee_email", email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] | null }),
  ]);

  // Members need the household id; the inviter-email lookups need only the invites.
  const [{ data: members, error: memErr }, sent, received] = await Promise.all([
    supabase
      .from("household_members")
      .select("user_id, role, joined_at")
      .eq("household_id", householdId),
    enrichInviterEmails((sentInvites ?? []).map((r) => mapInvite(r))),
    enrichInviterEmails((receivedInvites ?? []).map((r) => mapInvite(r))),
  ]);

  if (memErr) {
    console.error("[api/household] members failed", memErr.message);
    return apiError("api/household", memErr);
  }

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
