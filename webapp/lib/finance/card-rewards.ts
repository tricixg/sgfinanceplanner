import type { CreditCard } from "@/lib/types";
import {
  findCatalogByName,
  getCatalogEntry,
  type CardCatalogEntry,
  type CardRewardRule,
  type SpendCategory,
} from "@/lib/cards/sg-card-catalog";

export type RewardPreference = "miles" | "cashback" | "best";

export type CardRecommendation = {
  cardIndex: number;
  cardName: string;
  bank?: string;
  estimatedMiles?: number;
  estimatedCashback?: number;
  score: number;
  reason: string;
  ruleMatched: string;
  caveat?: string;
};

/** ~2 cents per mile for comparing miles vs cashback on "best" mode */
const MILE_VALUE_SGD = 0.02;

export function applyCatalogEntry(entry: CardCatalogEntry): Partial<CreditCard> {
  return {
    name: entry.name,
    bank: entry.bank,
    catalogId: entry.id,
    rewardType: entry.rewardType,
    rewardHeadline: entry.headline,
    rewardRules: entry.rules.map((rule) => ({
      category: rule.category,
      earn: rule.earn,
      cap: rule.cap,
    })),
  };
}

function ruleForCategory(
  card: CreditCard,
  category: SpendCategory
): CardRewardRule | undefined {
  const entry = card.catalogId ? getCatalogEntry(card.catalogId) : undefined;
  const rules = entry?.rules ?? [];
  const match =
    rules.find((r) => r.category === category) ??
    rules.find((r) => r.category === "general");
  return match;
}

function scoreRule(
  amount: number,
  rule: CardRewardRule,
  preference: RewardPreference
): { score: number; miles?: number; cashback?: number } {
  const mpd = rule.milesPerDollar ?? 0;
  const pct = rule.cashbackPct ?? 0;
  const miles = mpd > 0 ? amount * mpd : undefined;
  const cashback = pct > 0 ? (amount * pct) / 100 : undefined;

  if (preference === "miles") {
    const score = miles ?? 0;
    return { score, miles, cashback };
  }
  if (preference === "cashback") {
    const score = cashback ?? 0;
    return { score, miles, cashback };
  }

  const mileVal = (miles ?? 0) * MILE_VALUE_SGD;
  const cashVal = cashback ?? 0;
  if (mileVal >= cashVal) {
    return { score: mileVal, miles, cashback };
  }
  return { score: cashVal, miles, cashback };
}

export function recommendCardForSpend(
  cards: CreditCard[],
  amount: number,
  category: SpendCategory,
  preference: RewardPreference = "best"
): CardRecommendation | null {
  if (amount <= 0 || cards.length === 0) return null;

  let best: CardRecommendation | null = null;

  for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
    const card = cards[cardIndex];
    if (!card.catalogId) continue;
    const rule = ruleForCategory(card, category);
    if (!rule) continue;

    const { score, miles, cashback } = scoreRule(amount, rule, preference);
    if (score <= 0) continue;

    const caveatParts: string[] = [];
    if (rule.minSpend) caveatParts.push(`Min spend: ${rule.minSpend}`);
    if (rule.cap) caveatParts.push(`Cap: ${rule.cap}`);

    const candidate: CardRecommendation = {
      cardIndex,
      cardName: card.name,
      bank: card.bank,
      estimatedMiles: miles,
      estimatedCashback: cashback,
      score,
      reason: rule.earn,
      ruleMatched: rule.category,
      caveat: caveatParts.length ? caveatParts.join(" · ") : undefined,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  if (best) {
    console.log("[card-rewards] recommendCardForSpend", {
      amount,
      category,
      preference,
      winner: best.cardName,
      score: best.score,
    });
  }

  return best;
}

export function normalizeCreditCard(raw: Partial<CreditCard>): CreditCard {
  const base: CreditCard = {
    name: raw.name ?? "New card",
    statementDay: raw.statementDay ?? 1,
    paymentDueDay: raw.paymentDueDay ?? 21,
    statementAmount: raw.statementAmount ?? 0,
    includeOutstandingOnStatement: raw.includeOutstandingOnStatement ?? false,
    catalogId: raw.catalogId,
    bank: raw.bank,
    rewardType: raw.rewardType,
    rewardHeadline: raw.rewardHeadline,
    rewardRules: raw.rewardRules,
  };
  if (base.catalogId) {
    const entry = getCatalogEntry(base.catalogId);
    if (entry) {
      return {
        ...base,
        ...applyCatalogEntry(entry),
        statementDay: base.statementDay,
        paymentDueDay: base.paymentDueDay,
        statementAmount: base.statementAmount,
        includeOutstandingOnStatement: base.includeOutstandingOnStatement,
      };
    }
  }
  if (!base.catalogId && base.name) {
    const found = findCatalogByName(base.name);
    if (found) {
      return {
        ...base,
        ...applyCatalogEntry(found),
        statementDay: base.statementDay,
        paymentDueDay: base.paymentDueDay,
        statementAmount: base.statementAmount,
        includeOutstandingOnStatement: base.includeOutstandingOnStatement,
      };
    }
  }
  return base;
}

export function countCardsByRewardType(cards: CreditCard[]) {
  let miles = 0;
  let cashback = 0;
  let hybrid = 0;
  for (const c of cards) {
    if (c.rewardType === "miles") miles += 1;
    else if (c.rewardType === "cashback") cashback += 1;
    else if (c.rewardType === "hybrid") hybrid += 1;
  }
  return { miles, cashback, hybrid };
}