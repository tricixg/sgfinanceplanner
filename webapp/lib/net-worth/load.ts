import type { SupabaseClient } from "@supabase/supabase-js";
import type { NetWorthSnapshot } from "@/lib/types";

export async function loadNetWorthSnapshots(
  supabase: SupabaseClient,
  userId: string,
  limit = 60
): Promise<NetWorthSnapshot[]> {
  const { data, error } = await supabase
    .from("net_worth_snapshots")
    .select("month, lnw, cpf")
    .eq("user_id", userId)
    .order("month", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      month: String(row.month).slice(0, 10),
      lnw: Number(row.lnw ?? 0),
      cpf: Number(row.cpf ?? 0),
    }))
    .reverse();
}

export async function appendNetWorthSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snap: NetWorthSnapshot
): Promise<void> {
  const { error } = await supabase.from("net_worth_snapshots").upsert(
    {
      user_id: userId,
      month: snap.month,
      lnw: snap.lnw,
      cpf: snap.cpf,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month" }
  );
  if (error) throw new Error(error.message);
  console.info("[net-worth-history] upserted snapshot", { userId, month: snap.month });
}
