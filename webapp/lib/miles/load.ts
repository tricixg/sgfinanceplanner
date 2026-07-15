import type { SupabaseClient } from "@supabase/supabase-js";
import { mapMilesBalance } from "@/lib/miles/db-mappers";
import { MILE_PROGRAMS } from "@/lib/miles/types";
import type { MilesBundle } from "@/lib/miles/types";

export async function loadMilesBundle(
  supabase: SupabaseClient,
  userId: string
): Promise<MilesBundle> {
  const { data, error } = await supabase
    .from("miles_balances")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[miles] load failed", error.message);
    throw error;
  }

  const balances = (data ?? []).map(mapMilesBalance);

  const milesByProgram = {} as MilesBundle["totals"]["milesByProgram"];
  const uncountedByProgram = {} as MilesBundle["totals"]["uncountedByProgram"];
  for (const { key } of MILE_PROGRAMS) {
    let sum = 0;
    let uncounted = 0;
    for (const b of balances) {
      const rate = b.rates[key];
      if (rate && rate > 0) {
        sum += b.pointsBalance / rate;
      } else {
        uncounted += 1;
      }
    }
    milesByProgram[key] = sum;
    uncountedByProgram[key] = uncounted;
  }

  console.info("[miles] bundle loaded", { userId, count: balances.length });

  return { balances, totals: { milesByProgram, uncountedByProgram } };
}
