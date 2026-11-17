import type { SupabaseClient } from "@supabase/supabase-js";
import { SaveError } from "@/lib/sync/save-error";

/**
 * Accept a pending partner invite via the accept_partner_invite() SQL function
 * (migration 066). It validates the invite for the caller's email, moves the
 * membership, enforces the 2-member cap and marks the invite accepted in one
 * transaction. Returns the joined household id.
 */
export async function acceptPartnerInvite(
  supabase: SupabaseClient,
  inviteId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("accept_partner_invite", {
    invite_id: inviteId,
  });
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("household_full")) {
      throw new SaveError("That household already has two members.", 409);
    }
    if (msg.includes("invite_not_found")) {
      throw new SaveError("Invite not found or no longer pending.", 409);
    }
    if (msg.includes("not_authenticated")) {
      throw new SaveError("Sign in required.", 401);
    }
    throw new SaveError(msg || "Failed to accept invite", 500);
  }
  if (typeof data !== "string") {
    throw new SaveError("Failed to accept invite", 500);
  }
  return data;
}
