import { CATEGORY_PALETTE } from "@/lib/finance/category-colors";

/** Rank-based colours for cards and accounts; same palette as categories. */
export const SPENDING_CHART_COLORS: readonly string[] = CATEGORY_PALETTE;

export function colorAt(index: number): string {
  return SPENDING_CHART_COLORS[index % SPENDING_CHART_COLORS.length]!;
}
