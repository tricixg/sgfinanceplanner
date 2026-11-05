import type { SupabaseClient } from "@supabase/supabase-js";

export type PokerLocationRecord = {
  id: string;
  name: string;
  isOnline: boolean;
};

export async function listPokerLocationRecords(
  supabase: SupabaseClient,
  userId: string
): Promise<PokerLocationRecord[]> {
  const { data, error } = await supabase
    .from("poker_locations")
    .select("id, name, is_online")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name).trim(),
    isOnline: Boolean(r.is_online),
  }));
}

export async function listPokerLocations(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const records = await listPokerLocationRecords(supabase, userId);
  return records.map((r) => r.name).filter(Boolean);
}

export async function upsertPokerLocation(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  isOnline = false
): Promise<PokerLocationRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Location name is required");

  const { error } = await supabase.from("poker_locations").upsert(
    { user_id: userId, name: trimmed, is_online: isOnline },
    { onConflict: "user_id,name", ignoreDuplicates: true }
  );

  if (error) throw new Error(error.message);

  const { data, error: fetchErr } = await supabase
    .from("poker_locations")
    .select("id, name, is_online")
    .eq("user_id", userId)
    .eq("name", trimmed)
    .single();

  if (fetchErr || !data) throw new Error(fetchErr?.message ?? "Failed to save location");
  console.info("[poker] location saved", { userId, name: trimmed });
  return { id: String(data.id), name: String(data.name), isOnline: Boolean(data.is_online) };
}

export async function updatePokerLocation(
  supabase: SupabaseClient,
  userId: string,
  locationId: string,
  updates: { name?: string; isOnline?: boolean }
): Promise<PokerLocationRecord> {
  const { data: existing, error: fetchErr } = await supabase
    .from("poker_locations")
    .select("id, name, is_online")
    .eq("id", locationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Location not found");

  const oldName = String(existing.name).trim();
  const trimmed = updates.name !== undefined ? updates.name.trim() : oldName;
  if (updates.name !== undefined && !trimmed) throw new Error("Location name is required");

  const patch: Record<string, unknown> = {};
  if (trimmed !== oldName) patch.name = trimmed;
  if (updates.isOnline !== undefined) patch.is_online = updates.isOnline;

  if (Object.keys(patch).length === 0) {
    return { id: String(existing.id), name: oldName, isOnline: Boolean(existing.is_online) };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("poker_locations")
    .update(patch)
    .eq("id", locationId)
    .eq("user_id", userId)
    .select("id, name, is_online")
    .single();

  if (updateErr) throw new Error(updateErr.message);

  const sessionPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) {
    sessionPatch.location = trimmed;
    sessionPatch.venue = trimmed;
  }
  if (patch.is_online !== undefined) {
    sessionPatch.is_online = patch.is_online;
  }

  if (Object.keys(sessionPatch).length > 1) {
    const { error: sessionErr } = await supabase
      .from("poker_sessions")
      .update(sessionPatch)
      .eq("user_id", userId)
      .eq("location", oldName);

    if (sessionErr) throw new Error(sessionErr.message);
  }

  console.info("[poker] location updated", { userId, locationId, oldName, patch });
  return {
    id: String(updated.id),
    name: String(updated.name),
    isOnline: Boolean(updated.is_online),
  };
}

export async function deletePokerLocation(
  supabase: SupabaseClient,
  userId: string,
  locationId: string
): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from("poker_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Location not found");

  const name = String(existing.name).trim();

  const { error: sessionErr } = await supabase
    .from("poker_sessions")
    .update({ location: "", venue: "", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("location", name);

  if (sessionErr) throw new Error(sessionErr.message);

  const { error: delErr } = await supabase
    .from("poker_locations")
    .delete()
    .eq("id", locationId)
    .eq("user_id", userId);

  if (delErr) throw new Error(delErr.message);

  console.info("[poker] location deleted", { userId, locationId, name });
}
