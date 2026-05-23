import type { SupabaseClient } from "@supabase/supabase-js";

/** Ensure the user belongs to a household; create solo household if missing. */
export async function ensureUserHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data: existing, error: readErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readErr) {
    console.error("[household] read membership failed", readErr.message);
    throw readErr;
  }

  if (existing?.household_id) {
    return existing.household_id;
  }

  const { data: household, error: hhErr } = await supabase
    .from("households")
    .insert({})
    .select("id")
    .single();

  if (hhErr || !household) {
    console.error("[household] create household failed", hhErr?.message);
    throw hhErr ?? new Error("Failed to create household");
  }

  const { error: memErr } = await supabase.from("household_members").insert({
    household_id: household.id,
    user_id: userId,
    role: "owner",
  });

  if (memErr) {
    console.error("[household] add owner member failed", memErr.message);
    throw memErr;
  }

  console.info("[household] created solo household", { userId, householdId: household.id });
  return household.id;
}
