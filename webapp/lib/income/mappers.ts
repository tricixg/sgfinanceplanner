import type { IncomeCategory } from "@/lib/income/types";

export function mapIncomeCategory(row: Record<string, unknown>): IncomeCategory {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? "").trim(),
    slug: String(row.slug ?? ""),
    sortOrder: Number(row.sort_order ?? 0),
    countsInBaseline: row.counts_in_baseline === true,
    countsAsAdditive: row.counts_as_additive !== false,
  };
}
