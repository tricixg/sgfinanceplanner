import type { CreditCard, CreditCardRewardRule } from "@/lib/types";

export type DbCreditCard = {
  id: string;
  userId: string;
  cardKey: string;
  name: string;
  statementDay: number;
  paymentDueDay: number;
  statementAmount: number;
  interestRateApr: number;
  includeOutstandingOnStatement: boolean;
  catalogId: string | null;
  bank: string | null;
  rewardType: string | null;
  rewardHeadline: string | null;
  rewardRules: CreditCardRewardRule[];
  sortOrder: number;
  financialAccountId: string | null;
};

export function mapCreditCard(row: Record<string, unknown>): DbCreditCard {
  const rules = row.reward_rules;
  let rewardRules: CreditCardRewardRule[] = [];
  if (Array.isArray(rules)) {
    rewardRules = rules as CreditCardRewardRule[];
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    cardKey: String(row.card_key),
    name: String(row.name ?? ""),
    statementDay: Number(row.statement_day ?? 1),
    paymentDueDay: Number(row.payment_due_day ?? 1),
    statementAmount: Number(row.statement_amount ?? 0),
    interestRateApr: Number(row.interest_rate_apr ?? 0),
    includeOutstandingOnStatement: Boolean(row.include_outstanding_on_statement),
    catalogId: row.catalog_id ? String(row.catalog_id) : null,
    bank: row.bank ? String(row.bank) : null,
    rewardType: row.reward_type ? String(row.reward_type) : null,
    rewardHeadline: row.reward_headline ? String(row.reward_headline) : null,
    rewardRules,
    sortOrder: Number(row.sort_order ?? 0),
    financialAccountId: row.financial_account_id
      ? String(row.financial_account_id)
      : null,
  };
}

export function toCreditCard(row: DbCreditCard): CreditCard {
  return {
    id: row.cardKey,
    name: row.name,
    statementDay: row.statementDay,
    paymentDueDay: row.paymentDueDay,
    statementAmount: row.statementAmount,
    interestRateApr: row.interestRateApr,
    includeOutstandingOnStatement: row.includeOutstandingOnStatement,
    catalogId: row.catalogId ?? undefined,
    bank: row.bank ?? undefined,
    rewardType: row.rewardType as CreditCard["rewardType"],
    rewardHeadline: row.rewardHeadline ?? undefined,
    rewardRules: row.rewardRules.length ? row.rewardRules : undefined,
  };
}

export function dbIdFromCard(card: CreditCard, index: number): string {
  return card.id ?? `card-${index}`;
}
