export type IncomeCategory = {
  id: string;
  userId: string;
  name: string;
  slug: string;
  sortOrder: number;
  countsInBaseline: boolean;
  countsAsAdditive: boolean;
};

export type IncomeCategoryInput = {
  id?: string;
  name: string;
  slug?: string;
  sortOrder?: number;
  countsInBaseline?: boolean;
  countsAsAdditive?: boolean;
};

export const SYSTEM_INCOME_SLUGS = [
  "salary",
  "poker",
  "comms",
  "others",
  "reimbursement",
  "transport-claims",
  "medical-claims",
  "interest",
] as const;

/** Built-in category for bank interest (cash-account balance adjustments ticked as interest). */
export const INTEREST_INCOME_SLUG = "interest";
export type SystemIncomeSlug = (typeof SYSTEM_INCOME_SLUGS)[number];

export function isSystemIncomeSlug(slug: string): slug is SystemIncomeSlug {
  return (SYSTEM_INCOME_SLUGS as readonly string[]).includes(slug);
}
