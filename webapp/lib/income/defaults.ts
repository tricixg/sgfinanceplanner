import type { IncomeCategoryInput } from "@/lib/income/types";

export const DEFAULT_INCOME_CATEGORIES: IncomeCategoryInput[] = [
  {
    name: "Salary",
    slug: "salary",
    sortOrder: 0,
    countsInBaseline: true,
    countsAsAdditive: false,
  },
  {
    name: "Communication",
    slug: "comms",
    sortOrder: 1,
    countsInBaseline: true,
    countsAsAdditive: false,
  },
  {
    name: "Poker",
    slug: "poker",
    sortOrder: 2,
    countsInBaseline: false,
    countsAsAdditive: true,
  },
  {
    name: "Others",
    slug: "others",
    sortOrder: 3,
    countsInBaseline: false,
    countsAsAdditive: true,
  },
  {
    name: "Reimbursement",
    slug: "reimbursement",
    sortOrder: 4,
    countsInBaseline: false,
    countsAsAdditive: true,
  },
];
