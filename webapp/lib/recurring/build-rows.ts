import type { AutoCategory } from "@/lib/expenses/auto-category-ids";
import type { Expense } from "@/lib/savings/types";
import { prefillSpentAt } from "@/lib/recurring/prefill";
import {
  findPaymentForSource,
  isLoanActiveInMonth,
  type RecurringPaymentInfo,
} from "@/lib/recurring/status";
import type { IlpPolicy, InsurancePolicy, Loan, RecurringSubscription } from "@/lib/types";

export type RecurringRow = {
  kind: AutoCategory;
  sourceId: string;
  name: string;
  amount: number;
  deductionDay: number | null;
  suggestedSpentAt: string;
  defaultFinancialAccountId: string | null;
  defaultAccountName: string | null;
  paid: boolean;
  payment: RecurringPaymentInfo | null;
};

function rowFromSource(
  kind: AutoCategory,
  sourceId: string,
  name: string,
  amount: number,
  deductionDay: number | undefined,
  defaultFinancialAccountId: string | null | undefined,
  ym: string,
  expenses: Expense[],
  accountNames: Map<string, string>
): RecurringRow {
  const day = deductionDay && deductionDay >= 1 && deductionDay <= 31 ? deductionDay : null;
  const payment = findPaymentForSource(expenses, kind, sourceId, accountNames);
  const accountId = defaultFinancialAccountId ?? null;
  return {
    kind,
    sourceId,
    name,
    amount,
    deductionDay: day,
    suggestedSpentAt: prefillSpentAt(ym, day),
    defaultFinancialAccountId: accountId,
    defaultAccountName: accountId ? accountNames.get(accountId) ?? null : null,
    paid: Boolean(payment),
    payment,
  };
}

export function buildRecurringRows(
  ym: string,
  loans: Loan[],
  insurance: InsurancePolicy[],
  ilp: IlpPolicy[],
  subscriptions: RecurringSubscription[],
  expenses: Expense[],
  accountNames: Map<string, string>
): RecurringRow[] {
  const rows: RecurringRow[] = [];

  for (const l of loans) {
    if (!l.id || !isLoanActiveInMonth(l.end, ym) || l.monthly <= 0) continue;
    rows.push(
      rowFromSource(
        "debt",
        l.id,
        l.name || "Loan",
        l.monthly,
        l.deductionDay,
        l.defaultFinancialAccountId,
        ym,
        expenses,
        accountNames
      )
    );
  }

  for (const p of insurance) {
    if (!p.id || p.monthlyPremium <= 0) continue;
    rows.push(
      rowFromSource(
        "insurance",
        p.id,
        p.name || p.insurer || "Insurance",
        p.monthlyPremium,
        p.deductionDay,
        p.defaultFinancialAccountId,
        ym,
        expenses,
        accountNames
      )
    );
  }

  for (const p of ilp) {
    if (!p.id || p.monthlyPremium <= 0) continue;
    const label = [p.insurer, p.planName].filter(Boolean).join(" — ") || "ILP";
    rows.push(
      rowFromSource(
        "ilp",
        p.id,
        label,
        p.monthlyPremium,
        p.deductionDay,
        p.defaultFinancialAccountId,
        ym,
        expenses,
        accountNames
      )
    );
  }

  for (const s of subscriptions) {
    if (!s.id || s.amount <= 0) continue;
    rows.push(
      rowFromSource(
        "subscription",
        s.id,
        s.name || "Subscription",
        s.amount,
        s.deductionDay,
        s.defaultFinancialAccountId,
        ym,
        expenses,
        accountNames
      )
    );
  }

  return rows;
}
