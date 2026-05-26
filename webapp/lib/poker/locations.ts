import type { SupabaseClient } from "@supabase/supabase-js";

export async function listPokerLocations(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("poker_locations")
    .select("name")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => String(r.name).trim()).filter(Boolean);
}

export async function upsertPokerLocation(
  supabase: SupabaseClient,
  userId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;

  const { error } = await supabase.from("poker_locations").upsert(
    { user_id: userId, name: trimmed },
    { onConflict: "user_id,name", ignoreDuplicates: true }
  );

  if (error) throw new Error(error.message);
  console.info("[poker] location saved", { userId, name: trimmed });
}
