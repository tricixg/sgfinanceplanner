export const EXPENSE_ENTRY_SOURCES = ["manual", "telegram", "recurring"] as const;

export type ExpenseEntrySource = (typeof EXPENSE_ENTRY_SOURCES)[number];

export const DEFAULT_EXPENSE_ENTRY_SOURCE: ExpenseEntrySource = "manual";

export function parseExpenseEntrySource(
  value: unknown
): ExpenseEntrySource | null {
  if (typeof value !== "string") return null;
  return EXPENSE_ENTRY_SOURCES.includes(value as ExpenseEntrySource)
    ? (value as ExpenseEntrySource)
    : null;
}

/** Label for the Expenses tab Source column. */
export function expenseEntrySourceLabel(
  source: ExpenseEntrySource | undefined
): string {
  return source ?? DEFAULT_EXPENSE_ENTRY_SOURCE;
}
