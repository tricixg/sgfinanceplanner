import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMilesActivity, mapMilesLot } from "@/lib/miles/db-mappers";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { MilesBundle } from "@/lib/miles/types";

export async function loadMilesBundle(supabase: SupabaseClient, userId: string): Promise<MilesBundle> {
  const [lotRows, activityRows] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("miles_lots")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(from, to)
    ),
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("miles_activity")
        .select("*")
        .eq("user_id", userId)
        .order("created_at")
        .order("id")
        .range(from, to)
    ),
  ]);

  const bundle = { lots: lotRows.map(mapMilesLot), activity: activityRows.map(mapMilesActivity) };
  console.info("[lib/miles] bundle loaded", { lots: bundle.lots.length, activity: bundle.activity.length });
  return bundle;
}
