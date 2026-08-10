import type { SupabaseClient } from "@supabase/supabase-js";
import type { Holding, PortfolioSnapshot } from "@/lib/types";
import { loadHoldingDividendTotals } from "@/lib/holdings/dividends";

const UUID_RE = /^[0-9a-f-]{36}$/i;

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

export async function saveHoldings(
  supabase: SupabaseClient,
  userId: string,
  incoming: Holding[]
): Promise<Holding[]> {
  const { data: existing } = await supabase
    .from("holdings")
    .select("id, ticker")
    .eq("user_id", userId);

  const keepIds = new Set<string>();

  for (let i = 0; i < incoming.length; i++) {
    const h = incoming[i];
    const payload = {
      user_id: userId,
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

    const match = (existing ?? []).find(
      (e) => e.ticker === h.ticker && !keepIds.has(String(e.id))
    );
    if (match?.id && UUID_RE.test(String(match.id))) {
      keepIds.add(String(match.id));
      await supabase.from("holdings").update(payload).eq("id", match.id);
    } else {
      const { data: ins } = await supabase
        .from("holdings")
        .insert(payload)
        .select("id")
        .single();
      if (ins?.id) keepIds.add(String(ins.id));
    }
  }

  for (const row of existing ?? []) {
    if (!keepIds.has(String(row.id))) {
      await supabase.from("holdings").delete().eq("id", row.id);
    }
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

export async function migrateHoldingsFromDashboard(
  supabase: SupabaseClient,
  userId: string,
  holdings: Holding[],
  history: PortfolioSnapshot[]
): Promise<void> {
  const { count } = await supabase
    .from("holdings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) === 0 && holdings.length) {
    await saveHoldings(supabase, userId, holdings);
  }
  const { count: snapCount } = await supabase
    .from("portfolio_snapshots")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((snapCount ?? 0) === 0 && history.length) {
    for (const s of history.slice(-50)) {
      await appendPortfolioSnapshot(supabase, userId, s);
    }
  }
  console.info("[migrate] holdings", { userId, holdings: holdings.length });
}
