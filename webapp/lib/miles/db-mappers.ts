import type { MileProgramKey, MilesBalance } from "@/lib/miles/types";

export function mapMilesBalance(row: Record<string, unknown>): MilesBalance {
  const rawRates = (row.rates ?? {}) as Record<string, unknown>;
  const rates: Partial<Record<MileProgramKey, number>> = {};
  for (const [key, value] of Object.entries(rawRates)) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) rates[key as MileProgramKey] = n;
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ""),
    pointsBalance: Number(row.points_balance ?? 0),
    expiringAmount: row.expiring_amount != null ? Number(row.expiring_amount) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    rates,
    notes: String(row.notes ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
  };
}
