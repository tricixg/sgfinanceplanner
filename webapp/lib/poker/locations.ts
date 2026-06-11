import type { SupabaseClient } from "@supabase/supabase-js";

export type PokerLocationRecord = {
  id: string;
  name: string;
};

export async function listPokerLocationRecords(
  supabase: SupabaseClient,
  userId: string
): Promise<PokerLocationRecord[]> {
  const { data, error } = await supabase
    .from("poker_locations")
    .select("id, name")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name).trim(),
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
  name: string
): Promise<PokerLocationRecord> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Location name is required");

  const { error } = await supabase.from("poker_locations").upsert(
    { user_id: userId, name: trimmed },
    { onConflict: "user_id,name", ignoreDuplicates: true }
  );

  if (error) throw new Error(error.message);

  const { data, error: fetchErr } = await supabase
    .from("poker_locations")
    .select("id, name")
    .eq("user_id", userId)
    .eq("name", trimmed)
    .single();

  if (fetchErr || !data) throw new Error(fetchErr?.message ?? "Failed to save location");
  console.info("[poker] location saved", { userId, name: trimmed });
  return { id: String(data.id), name: String(data.name) };
}

export async function renamePokerLocation(
  supabase: SupabaseClient,
  userId: string,
  locationId: string,
  newName: string
): Promise<PokerLocationRecord> {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Location name is required");

  const { data: existing, error: fetchErr } = await supabase
    .from("poker_locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!existing) throw new Error("Location not found");

  const oldName = String(existing.name).trim();
  if (oldName === trimmed) {
    return { id: String(existing.id), name: oldName };
  }

  const { data: updated, error: updateErr } = await supabase
    .from("poker_locations")
    .update({ name: trimmed })
    .eq("id", locationId)
    .eq("user_id", userId)
    .select("id, name")
    .single();

  if (updateErr) throw new Error(updateErr.message);

  const { error: sessionErr } = await supabase
    .from("poker_sessions")
    .update({ location: trimmed, venue: trimmed, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("location", oldName);

  if (sessionErr) throw new Error(sessionErr.message);

  console.info("[poker] location renamed", { userId, locationId, oldName, newName: trimmed });
  return { id: String(updated.id), name: String(updated.name) };
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
