import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/require-user";
import { createAuthedSupabaseClient } from "@/lib/supabase/authed";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";

export type NetWorthMonthPoint = {
  month: string; // "YYYY-MM"
  cashTotal: number;
};

export async function GET(req: NextRequest) {
  if (!isSupabaseAuthConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }

  const auth = await requireSessionUser();
  if ("response" in auth) return auth.response;
  const userId = auth.user.id;

  const months = Math.min(
    36,
    Math.max(3, parseInt(new URL(req.url).searchParams.get("months") ?? "24", 10) || 24)
  );

  const supabase = await createAuthedSupabaseClient();

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const { data: txRows, error } = await supabase
    .from("savings_transactions")
    .select("account_id, occurred_at, balance_after")
    .eq("user_id", userId)
    .not("account_id", "is", null)
    .not("balance_after", "is", null)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group transactions by month
  const txByMonth: Record<string, { account_id: string; balance_after: number }[]> = {};
  for (const tx of txRows ?? []) {
    const ym = String(tx.occurred_at).slice(0, 7);
    if (!txByMonth[ym]) txByMonth[ym] = [];
    txByMonth[ym].push({
      account_id: String(tx.account_id),
      balance_after: Number(tx.balance_after),
    });
  }

  // Build month series from oldest tx month to current month
  const now = new Date();
  const currentYm = now.toISOString().slice(0, 7);

  const allMonths = Object.keys(txByMonth).sort();
  if (allMonths.length === 0) {
    return NextResponse.json({ configured: true, items: [] });
  }

  // Build continuous month list from first tx month to now
  const monthSeries: string[] = [];
  const cursor = new Date(`${allMonths[0]}-01T00:00:00`);
  const end = new Date(`${currentYm}-01T00:00:00`);
  while (cursor <= end) {
    monthSeries.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  // Replay transactions to get running account balances per month
  const accountBalance: Record<string, number> = {};
  const items: NetWorthMonthPoint[] = [];

  for (const ym of monthSeries) {
    for (const tx of txByMonth[ym] ?? []) {
      accountBalance[tx.account_id] = tx.balance_after;
    }
    if (Object.keys(accountBalance).length === 0) continue;
    const cashTotal = Object.values(accountBalance).reduce((s, v) => s + v, 0);
    items.push({ month: ym, cashTotal });
  }

  console.info("[api/accounts/net-worth-history] GET ok", {
    userId,
    months,
    points: items.length,
  });

  return NextResponse.json({ configured: true, items });
}
