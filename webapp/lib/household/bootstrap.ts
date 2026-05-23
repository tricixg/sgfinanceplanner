import type { SupabaseClient } from "@supabase/supabase-js";

async function readHouseholdId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1);

  if (error) {
    console.error("[household] read membership failed", error.message);
    throw error;
  }

  const row = data?.[0];
  return row?.household_id ?? null;
}

/** Best-effort delete of a household row left behind when member insert races. */
async function deleteOrphanHousehold(
  supabase: SupabaseClient,
  householdId: string
) {
  const { count } = await supabase
    .from("household_members")
    .select("*", { count: "exact", head: true })
    .eq("household_id", householdId);

  if ((count ?? 0) === 0) {
    const { error } = await supabase.from("households").delete().eq("id", householdId);
    if (error) {
      console.warn("[household] orphan cleanup failed", {
        householdId,
        message: error.message,
      });
    } else {
      console.info("[household] removed orphan household", { householdId });
    }
  }
}

/** Ensure the user belongs to a household; create solo household if missing. */
export async function ensureUserHousehold(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const existingId = await readHouseholdId(supabase, userId);
  if (existingId) {
    return existingId;
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
    if (memErr.code === "23505") {
      const existingAfterRace = await readHouseholdId(supabase, userId);
      if (existingAfterRace) {
        console.warn("[household] membership already exists (race) — reusing", {
          userId,
          householdId: existingAfterRace,
          orphanHouseholdId: household.id,
        });
        await deleteOrphanHousehold(supabase, household.id);
        return existingAfterRace;
      }
    }
    console.error("[household] add owner member failed", memErr.message);
    throw memErr;
  }

  console.info("[household] created solo household", {
    userId,
    householdId: household.id,
  });
  return household.id;
}
