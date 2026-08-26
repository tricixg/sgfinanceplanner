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
] as const;
export type SystemIncomeSlug = (typeof SYSTEM_INCOME_SLUGS)[number];

export function isSystemIncomeSlug(slug: string): slug is SystemIncomeSlug {
  return (SYSTEM_INCOME_SLUGS as readonly string[]).includes(slug);
}
