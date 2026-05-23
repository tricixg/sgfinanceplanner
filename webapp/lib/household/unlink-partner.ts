import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureUserHousehold } from "@/lib/household/bootstrap";

export type UnlinkPartnerResult = {
  householdId: string;
  memberIds: string[];
  deletedPools: number;
  deletedSharedGoals: number;
  deletedPoolTransactions: number;
};

/**
 * Dissolve a paired household: wipe shared pools/goals/ledger, delete the household,
 * and give each member a fresh solo household (safe for linking a new partner later).
 */
export async function unlinkPartner(
  admin: SupabaseClient,
  userId: string
): Promise<UnlinkPartnerResult> {
  const { data: membership, error: memErr } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (memErr) {
    console.error("[household/unlink] membership read failed", memErr.message);
    throw new Error(memErr.message);
  }
  if (!membership?.household_id) {
    throw new Error("Not in a household");
  }

  const householdId = membership.household_id;

  const { data: members, error: membersErr } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  if (membersErr) {
    console.error("[household/unlink] members list failed", membersErr.message);
    throw new Error(membersErr.message);
  }

  const memberIds = (members ?? []).map((m) => String(m.user_id));
  if (memberIds.length <= 1) {
    throw new Error("No partner linked");
  }

  const { data: pools } = await admin
    .from("savings_pools")
    .select("id")
    .eq("household_id", householdId);
  const poolIds = (pools ?? []).map((p) => String(p.id));

  if (poolIds.length > 0) {
    const { error: unlinkGoalsErr } = await admin
      .from("savings_goals")
      .update({ linked_pool_id: null })
      .in("linked_pool_id", poolIds);
    if (unlinkGoalsErr) {
      console.error("[household/unlink] clear goal pool links failed", unlinkGoalsErr.message);
      throw new Error(unlinkGoalsErr.message);
    }
  }

  const { count: txCount, error: txDelErr } = await admin
    .from("savings_transactions")
    .delete({ count: "exact" })
    .eq("household_id", householdId);
  if (txDelErr) {
    console.error("[household/unlink] pool transactions delete failed", txDelErr.message);
    throw new Error(txDelErr.message);
  }

  const { count: poolCount, error: poolDelErr } = await admin
    .from("savings_pools")
    .delete({ count: "exact" })
    .eq("household_id", householdId);
  if (poolDelErr) {
    console.error("[household/unlink] pools delete failed", poolDelErr.message);
    throw new Error(poolDelErr.message);
  }

  const { count: goalCount, error: goalDelErr } = await admin
    .from("savings_goals")
    .delete({ count: "exact" })
    .eq("household_id", householdId)
    .eq("scope", "shared");
  if (goalDelErr) {
    console.error("[household/unlink] shared goals delete failed", goalDelErr.message);
    throw new Error(goalDelErr.message);
  }

  const now = new Date().toISOString();
  const { error: inviteErr } = await admin
    .from("partner_invites")
    .update({ status: "cancelled", responded_at: now })
    .eq("household_id", householdId);
  if (inviteErr) {
    console.error("[household/unlink] invites cancel failed", inviteErr.message);
    throw new Error(inviteErr.message);
  }

  const { error: hhDelErr } = await admin.from("households").delete().eq("id", householdId);
  if (hhDelErr) {
    console.error("[household/unlink] household delete failed", hhDelErr.message);
    throw new Error(hhDelErr.message);
  }

  for (const memberId of memberIds) {
    await ensureUserHousehold(admin, memberId);
  }

  const result: UnlinkPartnerResult = {
    householdId,
    memberIds,
    deletedPools: poolCount ?? 0,
    deletedSharedGoals: goalCount ?? 0,
    deletedPoolTransactions: txCount ?? 0,
  };

  console.info("[household/unlink] partner unlinked", {
    initiatedBy: userId,
    ...result,
  });

  return result;
}
