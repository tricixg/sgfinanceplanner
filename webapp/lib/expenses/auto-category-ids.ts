export const AUTO_DEBT_ID = "auto:debt";
export const AUTO_INSURANCE_ID = "auto:insurance";
export const AUTO_ILP_ID = "auto:ilp";
export const AUTO_SUBSCRIPTION_ID = "auto:subscription";

export type AutoCategory = "debt" | "insurance" | "ilp" | "subscription";

export function autoCategoryFromBudgetLineId(id: string): AutoCategory | null {
  if (id === AUTO_DEBT_ID) return "debt";
  if (id === AUTO_INSURANCE_ID) return "insurance";
  if (id === AUTO_ILP_ID) return "ilp";
  if (id === AUTO_SUBSCRIPTION_ID) return "subscription";
  return null;
}

export type RecurringKind = AutoCategory;
