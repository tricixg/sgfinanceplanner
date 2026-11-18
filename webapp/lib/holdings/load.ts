import type { SupabaseClient } from "@supabase/supabase-js";
import type { Holding, PortfolioSnapshot } from "@/lib/types";
import { loadHoldingDividendTotals } from "@/lib/holdings/dividends";

import { SaveError, cleanIdList, isPersistedId } from "@/lib/sync/save-error";

export async function loadHoldings(
  supabase: SupabaseClient,
  userId: string
): Promise<Holding[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const dividends = await loadHoldingDividendTotals(supabase, userId);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    ticker: String(row.ticker ?? ""),
    market: row.market === "US" ? "US" : "SGX",
    qty: Number(row.qty ?? 0),
    avgCost: Number(row.avg_cost ?? 0),
    lastPrice: Number(row.last_price ?? 0),
    lastPriceAt: row.last_price_at ? String(row.last_price_at) : undefined,
    sector: String(row.sector ?? ""),
    lifetimeDividends: dividends.byHolding[String(row.id)] ?? 0,
  }));
}

/**
 * Save holdings. Rows are matched by DB `id` (never by ticker, so editing a
 * ticker updates the row instead of recreating it and losing its dividends).
 * Rows without a persisted id are inserted. Rows are deleted only when their
 * id is in `deletedIds`; being absent from `incoming` never deletes anything.
 */
export async function saveHoldings(
  supabase: SupabaseClient,
  userId: string,
  incoming: Holding[],
  deletedIds: unknown = []
): Promise<Holding[]> {
  for (let i = 0; i < incoming.length; i++) {
    const h = incoming[i];
    const payload = {
      name: h.name ?? "",
      ticker: h.ticker ?? "",
      market: h.market ?? "SGX",
      qty: h.qty ?? 0,
      avg_cost: h.avgCost ?? 0,
      last_price: h.lastPrice ?? 0,
      last_price_at: h.lastPriceAt ?? null,
      sector: h.sector ?? "",
      sort_order: i,
      updated_at: new Date().toISOString(),
    };

    if (isPersistedId(h.id)) {
      const { data, error } = await supabase
        .from("holdings")
        .update(payload)
        .eq("id", h.id)
        .eq("user_id", userId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new SaveError(
          `Holding "${h.name || h.ticker}" no longer exists. Reload and try again.`,
          409
        );
      }
    } else {
      const { error } = await supabase
        .from("holdings")
        .insert({ user_id: userId, ...payload });
      if (error) throw new Error(error.message);
    }
  }

  const toDelete = cleanIdList(deletedIds).filter(
    (id) => !incoming.some((h) => h.id === id)
  );
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("holdings")
      .delete()
      .in("id", toDelete)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }

  return loadHoldings(supabase, userId);
}

export async function loadPortfolioSnapshots(
  supabase: SupabaseClient,
  userId: string,
  limit = 30
): Promise<PortfolioSnapshot[]> {
  const queryLimit = Math.min(200, Math.max(limit, limit * 5));
  const { data, error } = await supabase
    .from("portfolio_snapshots")
    .select("*")
    .eq("user_id", userId)
    .order("recorded_at", { ascending: false })
    .limit(queryLimit);
  if (error) throw new Error(error.message);
  const out: PortfolioSnapshot[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const recordedAt = String(row.recorded_at).slice(0, 10);
    if (!recordedAt || seen.has(recordedAt)) continue;
    seen.add(recordedAt);
    out.push({
      recordedAt,
      totalValue: Number(row.total_value ?? 0),
      totalCost: Number(row.total_cost ?? 0),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function appendPortfolioSnapshot(
  supabase: SupabaseClient,
  userId: string,
  snap: PortfolioSnapshot
): Promise<void> {
  const retentionDays = 30;
  const dayStart = `${snap.recordedAt}T00:00:00`;
  const dayEnd = `${snap.recordedAt}T23:59:59.999`;
  const { data: existing, error: findErr } = await supabase
    .from("portfolio_snapshots")
    .select("id, recorded_at")
    .eq("user_id", userId)
    .gte("recorded_at", dayStart)
    .lte("recorded_at", dayEnd)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from("portfolio_snapshots")
      .update({
        total_value: snap.totalValue,
        total_cost: snap.totalCost,
      })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { error: insertErr } = await supabase.from("portfolio_snapshots").insert({
      user_id: userId,
      recorded_at: snap.recordedAt,
      total_value: snap.totalValue,
      total_cost: snap.totalCost,
    });
    if (insertErr) throw new Error(insertErr.message);
  }

  const cutoff = new Date(`${snap.recordedAt}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const cutoffYmd = cutoff.toISOString().slice(0, 10);
  const { error: cleanupErr } = await supabase
    .from("portfolio_snapshots")
    .delete()
    .eq("user_id", userId)
    .lt("recorded_at", cutoffYmd);
  if (cleanupErr) throw new Error(cleanupErr.message);
  console.info("[holdings] pruned old portfolio snapshots", {
    userId,
    keepDays: retentionDays,
    cutoff: cutoffYmd,
  });
}
