import type { BnplPlan } from "@/lib/types";

export const COMPUTED_BNPL_LABEL = "Buy Now Pay Later";

export function defaultBnplPlan(): BnplPlan {
  return { name: "", totalAmount: 0, tenureMonths: 1, amount: 0, monthsPaid: 0 };
}
