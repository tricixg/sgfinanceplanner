"use client";

import { useMemo, useState } from "react";
import type { CreditCard, DashboardState } from "@/lib/types";
import {
  BANKS,
  CATALOG_AS_OF,
  CARDS_BY_BANK,
  getCatalogEntry,
  SPEND_CATEGORY_LABELS,
  type SpendCategory,
} from "@/lib/cards/sg-card-catalog";
import {
  applyCatalogEntry,
  countCardsByRewardType,
  recommendCardForSpend,
  type CardRecommendation,
  type RewardPreference,
} from "@/lib/finance/card-rewards";
import { ChartBox } from "@/components/ChartBox";
import {
  ensureCreditCardIds,
  getAllCardStatementBreakdowns,
  totalInstalmentOnStatements,
  totalRevolvingOnStatements,
} from "@/lib/finance/card-linking";
import { totalStatementAmount } from "@/lib/finance/calendar";
import { fmt, fmt2 } from "@/lib/finance/helpers";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

const SPEND_CATEGORIES = Object.keys(SPEND_CATEGORY_LABELS) as SpendCategory[];

function NumInput({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step ?? 1}
      min={min}
      max={max}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

function rewardTagClass(type?: CreditCard["rewardType"]): string {
  if (type === "miles") return "tag t-live";
  if (type === "cashback") return "tag t-soon";
  if (type === "hybrid") return "tag t-end";
  return "tag";
}

export function TabCards({ state: S, setState }: Props) {
  const [editing, setEditing] = useState(false);
  const [spendAmount, setSpendAmount] = useState(500);
  const [spendCategory, setSpendCategory] = useState<SpendCategory>("dining");
  const [preference, setPreference] = useState<RewardPreference>("best");
  const [recommendation, setRecommendation] = useState<CardRecommendation | null>(
    null
  );

  const stmtTotal = totalStatementAmount(S);
  const statementBreakdowns = useMemo(
    () => getAllCardStatementBreakdowns(S),
    [S.creditCards, S.loans]
  );
  const rewardCounts = useMemo(
    () => countCardsByRewardType(S.creditCards),
    [S.creditCards]
  );

  const updateCard = (i: number, patch: Partial<CreditCard>) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
    console.log("[TabCards] updated card", i, patch);
  };

  const applyCatalog = (i: number, catalogId: string) => {
    if (!catalogId) {
      updateCard(i, {
        catalogId: undefined,
        bank: undefined,
        rewardType: undefined,
        rewardHeadline: undefined,
        rewardRules: undefined,
      });
      return;
    }
    const entry = getCatalogEntry(catalogId);
    if (!entry) return;
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.map((c, j) =>
        j === i
          ? {
              ...c,
              ...applyCatalogEntry(entry),
              statementDay: c.statementDay,
              paymentDueDay: c.paymentDueDay,
              statementAmount: c.statementAmount,
            }
          : c
      ),
    }));
    console.log("[TabCards] applied catalog", catalogId);
  };

  const addCard = () => {
    setState((prev) => {
      const creditCards = ensureCreditCardIds([
        ...prev.creditCards,
        {
          name: "New card",
          statementDay: 1,
          paymentDueDay: 21,
          statementAmount: 0,
        },
      ]);
      console.log("[TabCards] added card");
      return { ...prev, creditCards };
    });
  };

  const removeCard = (i: number) => {
    setState((prev) => ({
      ...prev,
      creditCards: prev.creditCards.filter((_, j) => j !== i),
    }));
    console.log("[TabCards] removed card", i);
  };

  const runAdvisor = () => {
    const rec = recommendCardForSpend(
      S.creditCards,
      spendAmount,
      spendCategory,
      preference
    );
    setRecommendation(rec);
    console.log("[TabCards] recommend", {
      spendAmount,
      spendCategory,
      preference,
      rec,
    });
  };

  const finishEditing = () => {
    setEditing(false);
    console.log("[TabCards] edit mode off");
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Pick cards from the Singapore catalog (indicative as of {CATALOG_AS_OF}) to
        auto-fill miles/cashback rules. Statement amounts and due dates appear on{" "}
        <b>This Month</b>. Confirm current T&Cs on your bank site before large spends.
      </div>

      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="stat accent">
          <div className="lbl">Statement balances (all cards)</div>
          <div className="val">{fmt(stmtTotal)}</div>
        </div>
        <div className="stat">
          <div className="lbl">Cards tracked</div>
          <div className="val">{S.creditCards.length}</div>
          <div className="note">
            {rewardCounts.miles} miles · {rewardCounts.cashback} cashback
            {rewardCounts.hybrid > 0 ? ` · ${rewardCounts.hybrid} hybrid` : ""}
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Salary credit day</div>
          <div className="val">Day {S.salaryCreditDay}</div>
          <div className="note">Salary on ME tab</div>
        </div>
      </div>

      <div className="section-head">
        <h2>Credit cards</h2>
        {editing ? (
          <button type="button" className="btn sm" onClick={finishEditing}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setEditing(true);
              console.log("[TabCards] edit mode on");
            }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          {S.creditCards.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
              No cards yet. Add one below.
            </p>
          ) : (
            S.creditCards.map((c, i) => (
              <div key={i} className="card-edit-block">
                <div className="catalog-select-row">
                  <label>
                    Bank
                    <select
                      value={c.bank ?? ""}
                      onChange={(e) => {
                        const bank = e.target.value;
                        updateCard(i, { bank: bank || undefined });
                        if (bank && c.catalogId) {
                          const stillValid = CARDS_BY_BANK[bank]?.some(
                            (x) => x.id === c.catalogId
                          );
                          if (!stillValid) applyCatalog(i, "");
                        }
                      }}
                    >
                      <option value="">— Bank —</option>
                      {BANKS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Card product
                    <select
                      value={c.catalogId ?? ""}
                      onChange={(e) => applyCatalog(i, e.target.value)}
                    >
                      <option value="">Custom / not in list</option>
                      {(c.bank ? CARDS_BY_BANK[c.bank] ?? [] : []).map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="editrow cards-edit">
                  <input
                    type="text"
                    value={c.name}
                    placeholder="Display name"
                    onChange={(e) => updateCard(i, { name: e.target.value })}
                  />
                  <NumInput
                    value={c.statementDay}
                    min={1}
                    max={31}
                    onChange={(v) =>
                      updateCard(i, {
                        statementDay: Math.min(31, Math.max(1, Math.round(v))),
                      })
                    }
                  />
                  <NumInput
                    value={c.paymentDueDay}
                    min={1}
                    max={31}
                    onChange={(v) =>
                      updateCard(i, {
                        paymentDueDay: Math.min(31, Math.max(1, Math.round(v))),
                      })
                    }
                  />
                  <NumInput
                    value={c.statementAmount}
                    step={0.01}
                    onChange={(v) => updateCard(i, { statementAmount: v })}
                  />
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => removeCard(i)}
                  >
                    del
                  </button>
                </div>
                <label className="card-outstanding-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(c.includeOutstandingOnStatement)}
                    onChange={(e) => {
                      updateCard(i, {
                        includeOutstandingOnStatement: e.target.checked,
                      });
                      console.log("[TabCards] include outstanding", {
                        card: c.name,
                        on: e.target.checked,
                      });
                    }}
                  />
                  Include plan outstanding on statement breakdown (monthly + outstanding)
                </label>
                {c.rewardHeadline && (
                  <p className="note card-edit-reward">{c.rewardHeadline}</p>
                )}
              </div>
            ))
          )}
          <div className="toolbar">
            <button type="button" className="btn ghost sm" onClick={addCard}>
              + Add card
            </button>
          </div>
        </div>
      ) : (
        <div className="card table-scroll">
          {S.creditCards.length === 0 ? (
            <p style={{ color: "var(--muted)", fontStyle: "italic" }}>
              No credit cards configured. Click Edit to add one.
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Bank</th>
                  <th>Rewards</th>
                  <th>Stmt day</th>
                  <th>Due day</th>
                  <th>Statement</th>
                  <th>+ Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {S.creditCards.map((c, i) => (
                  <tr key={i}>
                    <td>{c.name}</td>
                    <td>{c.bank ?? "—"}</td>
                    <td>
                      {c.rewardHeadline ? (
                        <>
                          <span className={rewardTagClass(c.rewardType)}>
                            {c.rewardType ?? "—"}
                          </span>
                          <div className="note" style={{ marginTop: 4 }}>
                            {c.rewardHeadline}
                          </div>
                          {c.rewardRules && c.rewardRules.length > 0 && (
                            <details className="reward-details">
                              <summary>Category rates</summary>
                              <ul>
                                {c.rewardRules.map((rule, ri) => (
                                  <li key={ri}>
                                    <b>{SPEND_CATEGORY_LABELS[rule.category as SpendCategory] ?? rule.category}</b>:{" "}
                                    {rule.earn}
                                    {rule.cap ? ` (${rule.cap})` : ""}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </td>
                    <td className="num">Day {c.statementDay}</td>
                    <td className="num">Day {c.paymentDueDay}</td>
                    <td className="num">
                      {c.statementAmount > 0 ? fmt2(c.statementAmount) : "—"}
                    </td>
                    <td>{c.includeOutstandingOnStatement ? "Yes" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {statementBreakdowns.length > 0 && (
        <>
          <h2 style={{ marginTop: 24 }}>Statement breakdown</h2>
          <p className="note" style={{ marginBottom: 12 }}>
            By default, instalments use each plan&apos;s <b>monthly</b> charge from{" "}
            <b>Debts &amp; Loans</b>. Tick <b>Include plan outstanding</b> on a card
            (Edit) to add linked plan outstanding as well. Revolving spend = statement
            minus that total.
          </p>
          <div className="grid g2 card-breakdown-grid">
            {statementBreakdowns.map((b) => (
              <div className="card" key={b.cardId}>
                <h3 className="card-breakdown-title">{b.cardName}</h3>
                <div className="grid g2" style={{ marginBottom: 12 }}>
                  <div className="stat">
                    <div className="lbl">Statement</div>
                    <div className="val">{fmt2(b.statementAmount)}</div>
                  </div>
                  <div className="stat accent">
                    <div className="lbl">Revolving spend</div>
                    <div className="val">{fmt2(b.revolvingSpend)}</div>
                  </div>
                  <div className="stat warn">
                    <div className="lbl">
                      {b.includesOutstanding
                        ? "Instalments + outstanding"
                        : "Instalments (this month)"}
                    </div>
                    <div className="val">{fmt2(b.instalmentOnStatement)}</div>
                  </div>
                </div>
                {b.statementAmount > 0 || b.instalmentOnStatement > 0 ? (
                  <ChartBox
                    type="doughnut"
                    data={{
                      labels: [
                        "Revolving spend",
                        b.includesOutstanding
                          ? "Instalments + outstanding"
                          : "Instalments (this month)",
                      ],
                      datasets: [
                        {
                          data: [b.revolvingSpend, b.instalmentOnStatement],
                          backgroundColor: ["#2f5d3a", "#b5482e"],
                          borderColor: "#11201a",
                          borderWidth: 1.5,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: "bottom" },
                        tooltip: {
                          callbacks: {
                            label: (ctx) =>
                              `${ctx.label}: ${fmt2(Number(ctx.raw))}`,
                          },
                        },
                      },
                    }}
                  />
                ) : null}
                {b.loans.length > 0 && (
                  <ul className="card-breakdown-loans">
                    {b.loans.map((loan) => (
                      <li key={loan.name}>
                        {loan.name}: {fmt2(loan.monthly)}/mo on statement
                        {loan.out > 0 ? ` · ${fmt2(loan.out)} still outstanding` : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {b.instalmentOnStatement > b.statementAmount && (
                  <p className="note" style={{ color: "var(--rust)", marginTop: 8 }}>
                    Monthly instalments exceed statement — check statement amount or
                    monthly figures on linked plans.
                  </p>
                )}
              </div>
            ))}
          </div>
          {statementBreakdowns.length > 1 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 className="card-breakdown-title">All cards (summary)</h3>
              <ChartBox
                type="bar"
                data={{
                  labels: ["Revolving spend", "Instalments (this month)"],
                  datasets: [
                    {
                      label: "SGD",
                      data: [
                        totalRevolvingOnStatements(statementBreakdowns),
                        totalInstalmentOnStatements(statementBreakdowns),
                      ],
                      backgroundColor: ["#2f5d3a", "#b5482e"],
                      borderColor: "#11201a",
                      borderWidth: 1.5,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: (v) => "$" + Number(v).toLocaleString(),
                      },
                    },
                  },
                }}
              />
            </div>
          )}
        </>
      )}

      <h2 style={{ marginTop: 24 }}>Which card to use?</h2>
      <div className="card card-advisor">
        <p className="note" style={{ marginTop: 0 }}>
          Compares only cards in your wallet that were picked from the catalog. Caps and
          min-spend are shown as reminders — not enforced in the estimate.
        </p>
        <div className="card-advisor-form">
          <label>
            Spend amount (SGD)
            <NumInput
              value={spendAmount}
              step={10}
              onChange={setSpendAmount}
            />
          </label>
          <label>
            Category
            <select
              value={spendCategory}
              onChange={(e) =>
                setSpendCategory(e.target.value as SpendCategory)
              }
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
              onChange={(e) =>
                setPreference(e.target.value as RewardPreference)
              }
            >
              <option value="best">Best value (miles vs cashback)</option>
              <option value="miles">Miles</option>
              <option value="cashback">Cashback</option>
            </select>
          </label>
          <button type="button" className="btn sm" onClick={runAdvisor}>
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
              {recommendation.estimatedMiles != null &&
                recommendation.estimatedMiles > 0 && (
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
            {S.creditCards.some((c) => c.catalogId)
              ? "Enter amount and category, then suggest."
              : "Edit your cards and select products from the catalog to enable suggestions."}
          </p>
        )}
      </div>
    </section>
  );
}
