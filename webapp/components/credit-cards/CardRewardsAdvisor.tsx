"use client";

import type { CreditCard } from "@/lib/types";
import {
  SPEND_CATEGORY_LABELS,
  type SpendCategory,
} from "@/lib/cards/sg-card-catalog";
import type { CardRecommendation, RewardPreference } from "@/lib/finance/card-rewards";
import { fmt2 } from "@/lib/finance/helpers";
import { DecimalInput } from "@/components/DecimalInput";

const SPEND_CATEGORIES = Object.keys(SPEND_CATEGORY_LABELS) as SpendCategory[];

type Props = {
  cards: CreditCard[];
  spendAmount: number;
  onSpendAmountChange: (v: number) => void;
  spendCategory: SpendCategory;
  onSpendCategoryChange: (v: SpendCategory) => void;
  preference: RewardPreference;
  onPreferenceChange: (v: RewardPreference) => void;
  recommendation: CardRecommendation | null;
  onSuggest: () => void;
};

export function CardRewardsAdvisor({
  cards,
  spendAmount,
  onSpendAmountChange,
  spendCategory,
  onSpendCategoryChange,
  preference,
  onPreferenceChange,
  recommendation,
  onSuggest,
}: Props) {
  return (
    <>
      <h2 style={{ marginTop: 24 }}>Which card to use?</h2>
      <div className="card card-advisor">
        <p className="note" style={{ marginTop: 0 }}>
          Compares only cards in your wallet that were picked from the catalog. Caps and
          min-spend are shown as reminders — not enforced in the estimate.
        </p>
        <div className="card-advisor-form">
          <label>
            Spend amount (SGD)
            <DecimalInput value={spendAmount} step={10} onChange={onSpendAmountChange} />
          </label>
          <label>
            Category
            <select
              value={spendCategory}
              onChange={(e) => onSpendCategoryChange(e.target.value as SpendCategory)}
            >
              {SPEND_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {SPEND_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Prefer
            <select
              value={preference}
              onChange={(e) => onPreferenceChange(e.target.value as RewardPreference)}
            >
              <option value="best">Best value (miles vs cashback)</option>
              <option value="miles">Miles</option>
              <option value="cashback">Cashback</option>
            </select>
          </label>
          <button type="button" className="btn sm" onClick={onSuggest}>
            Suggest card
          </button>
        </div>
        {recommendation ? (
          <div className="card-advisor-result">
            <div className="lbl">Use this card</div>
            <div className="val" style={{ fontSize: "1.25rem" }}>
              {recommendation.cardName}
              {recommendation.bank ? ` (${recommendation.bank})` : ""}
            </div>
            <p>
              <b>{recommendation.reason}</b>
              {recommendation.estimatedMiles != null && recommendation.estimatedMiles > 0 && (
                <> · Est. {Math.round(recommendation.estimatedMiles)} miles</>
              )}
              {recommendation.estimatedCashback != null &&
                recommendation.estimatedCashback > 0 && (
                  <> · Est. {fmt2(recommendation.estimatedCashback)} cashback</>
                )}
            </p>
            {recommendation.caveat && (
              <p className="note" style={{ color: "var(--rust)" }}>
                {recommendation.caveat}
              </p>
            )}
          </div>
        ) : (
          <p className="note" style={{ marginBottom: 0 }}>
            {cards.some((c) => c.catalogId)
              ? "Enter amount and category, then suggest."
              : "Edit your cards and select products from the catalog to enable suggestions."}
          </p>
        )}
      </div>
    </>
  );
}
