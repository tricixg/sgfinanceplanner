import type { PartnerInvite } from "@/lib/savings/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve auth user emails (service role). */
export async function lookupUserEmails(
  userIds: string[]
): Promise<Map<string, string>> {
  const emailById = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return emailById;

  const admin = createAdminClient();
  if (!admin) return emailById;

  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) {
        console.warn("[household] user email lookup failed", {
          userId: id,
          message: error.message,
        });
        return;
      }
      const email = data.user?.email?.trim();
      if (email) emailById.set(id, email);
    })
  );

  return emailById;
}

/** Resolve inviter emails from auth.users (service role). */
export async function enrichInviterEmails(
  invites: PartnerInvite[]
): Promise<PartnerInvite[]> {
  if (!invites.length) return invites;
  const emailById = await lookupUserEmails(invites.map((i) => i.inviterId));
  return invites.map((inv) => ({
    ...inv,
    inviterEmail: emailById.get(inv.inviterId) ?? inv.inviterEmail,
  }));
}
