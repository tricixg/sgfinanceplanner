import type { PartnerInvite } from "@/lib/savings/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Resolve inviter emails from auth.users (service role). */
export async function enrichInviterEmails(
  invites: PartnerInvite[]
): Promise<PartnerInvite[]> {
  if (!invites.length) return invites;

  const admin = createAdminClient();
  if (!admin) return invites;

  const ids = [...new Set(invites.map((i) => i.inviterId))];
  const emailById = new Map<string, string>();

  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) {
        console.warn("[household] inviter email lookup failed", {
          inviterId: id,
          message: error.message,
        });
        return;
      }
      const email = data.user?.email?.trim();
      if (email) emailById.set(id, email);
    })
  );

  return invites.map((inv) => ({
    ...inv,
    inviterEmail: emailById.get(inv.inviterId) ?? inv.inviterEmail,
  }));
}
