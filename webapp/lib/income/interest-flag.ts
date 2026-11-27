/**
 * Rules for marking an existing cash-account savings transaction as interest
 * (or undoing it). Interest is stored as a deposit in the built-in Interest
 * income category; the amount never changes, so the account balance doesn't
 * either and no ledger replay is needed.
 */
export type InterestFlagRow = {
  kind: string;
  amount: number;
  accountId: string | null;
  incomeCategoryId: string | null;
};

export type InterestFlagResult =
  | { patch: { kind: "deposit" | "adjustment"; income_category_id: string | null } | null }
  | { error: string };

export function interestFlagPatch(
  row: InterestFlagRow,
  markInterest: boolean,
  interestCategoryId: string | null
): InterestFlagResult {
  if (!interestCategoryId) return { error: "Interest income category not found" };
  const isInterest = row.kind === "deposit" && row.incomeCategoryId === interestCategoryId;

  if (markInterest) {
    if (isInterest) return { patch: null };
    if (!row.accountId) return { error: "Only cash-account entries can be marked as interest" };
    if (row.kind !== "adjustment") return { error: "Only adjustments can be marked as interest" };
    if (!(row.amount > 0)) return { error: "Interest must increase the balance" };
    return { patch: { kind: "deposit", income_category_id: interestCategoryId } };
  }

  if (row.kind === "adjustment" && row.incomeCategoryId == null) return { patch: null };
  if (!isInterest) return { error: "This entry is not marked as interest" };
  return { patch: { kind: "adjustment", income_category_id: null } };
}
