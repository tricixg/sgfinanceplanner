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

/**
 * Best-effort delete of a household row left behind when a direct member insert races. Only the
 * direct-insert path (service role / dev bypass) can reach this, and only that client can delete.
 */
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

/**
 * create_solo_household() errors that mean "this client has no signed-in user", i.e. the service
 * role or the dev bypass. Those clients bypass RLS, so a direct insert is allowed (and is the only
 * way, since they have no auth.uid()). A missing function is NOT in this list: migration 066 is
 * required, and an authed client cannot write household_members directly any more.
 */
function isNoAuthUserError(error: { code?: string; message?: string }): boolean {
  return error.code === "28000" || /not_authenticated/i.test(error.message ?? "");
}

/**
 * Ensure the user belongs to a household; create solo household if missing.
 *
 * Since migration 066 clients can no longer insert into household_members, so
 * a signed-in user's solo household is created by the create_solo_household()
 * SQL function (atomic, and it cleans up its own race loser). `viaServiceRole`
 * (used when dissolving a pairing, where the caller creates households for OTHER
 * users) and the dev bypass write directly with the RLS-bypassing client.
 */
export async function ensureUserHousehold(
  supabase: SupabaseClient,
  userId: string,
  opts: { viaServiceRole?: boolean } = {}
): Promise<string> {
  const existingId = await readHouseholdId(supabase, userId);
  if (existingId) {
    return existingId;
  }

  if (!opts.viaServiceRole) {
    const { data, error } = await supabase.rpc("create_solo_household");
    if (!error && typeof data === "string") {
      console.info("[household] created solo household", { userId, householdId: data });
      return data;
    }
    if (error && !isNoAuthUserError(error)) {
      console.error("[household] create_solo_household failed", error.message);
      throw new Error(error.message);
    }
    if (error) {
      console.info("[household] no signed-in user on this client — direct insert");
    }
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
