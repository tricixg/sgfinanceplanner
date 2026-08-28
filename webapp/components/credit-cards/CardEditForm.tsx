"use client";

import { useState } from "react";
import type { CreditCard } from "@/lib/types";
import { BANKS, CARDS_BY_BANK, getCatalogEntry } from "@/lib/cards/sg-card-catalog";
import { DecimalInput } from "@/components/DecimalInput";

type Props = {
  cards: CreditCard[];
  saving: boolean;
  onUpdate: (index: number, patch: Partial<CreditCard>) => void;
  onApplyCatalog: (index: number, catalogId: string) => void;
  onAdd: () => void;
};

export function CardEditForm({
  cards,
  saving,
  onUpdate,
  onApplyCatalog,
  onAdd,
}: Props) {
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = cards.filter((c) => c.hidden).length;

  return (
    <div className="card">
      <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0 }}>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="disclosure-toggle"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            style={{ marginBottom: 8 }}
          >
            <span className="caret">{showHidden ? "▾" : "▸"}</span>
            {showHidden ? "Hide" : "Show"} {hiddenCount} hidden card
            {hiddenCount === 1 ? "" : "s"}
          </button>
        )}
        {cards.filter((c) => showHidden || !c.hidden).length === 0 ? (
          <p style={{ color: "var(--muted)", fontStyle: "italic", marginBottom: 12 }}>
            No cards yet. Add one below.
          </p>
        ) : (
          cards.map((c, i) => {
            if (c.hidden && !showHidden) return null;
            return (
            <div key={i} className="card-edit-block" style={c.hidden ? { opacity: 0.6 } : undefined}>
              <div className="catalog-select-row">
                <label>
                  Bank
                  <select
                    value={c.bank ?? ""}
                    onChange={(e) => {
                      const bank = e.target.value;
                      onUpdate(i, { bank: bank || undefined });
                      if (bank && c.catalogId) {
                        const stillValid = CARDS_BY_BANK[bank]?.some(
                          (x) => x.id === c.catalogId
                        );
                        if (!stillValid) onApplyCatalog(i, "");
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
                    onChange={(e) => onApplyCatalog(i, e.target.value)}
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
                  onChange={(e) => onUpdate(i, { name: e.target.value })}
                />
                <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                  Stmt day
                  <DecimalInput
                    value={c.statementDay}
                    min={1}
                    max={31}
                    onChange={(v) =>
                      onUpdate(i, {
                        statementDay: Math.min(31, Math.max(1, Math.round(v))),
                      })
                    }
                  />
                </label>
                <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                  Due day
                  <DecimalInput
                    value={c.paymentDueDay}
                    min={1}
                    max={31}
                    onChange={(v) =>
                      onUpdate(i, {
                        paymentDueDay: Math.min(31, Math.max(1, Math.round(v))),
                      })
                    }
                  />
                </label>
                <label className="note" style={{ display: "flex", flexDirection: "column" }}>
                  Interest % p.a.
                  <DecimalInput
                    value={c.interestRateApr ?? 0}
                    step={0.01}
                    min={0}
                    onChange={(v) => onUpdate(i, { interestRateApr: v })}
                  />
                </label>
                {c.hidden ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => onUpdate(i, { hidden: false })}
                  >
                    Unhide
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn del sm"
                    onClick={() => onUpdate(i, { hidden: true })}
                  >
                    Hide
                  </button>
                )}
              </div>
              <label className="note card-edit-reward">
                Rewards note
                <textarea
                  className="card-edit-reward-input"
                  rows={2}
                  value={c.rewardHeadline ?? ""}
                  placeholder={
                    c.catalogId
                      ? (getCatalogEntry(c.catalogId)?.headline ??
                        "Rewards summary for this card")
                      : "Describe this card's rewards"
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    onUpdate(i, {
                      rewardHeadline: value.length > 0 ? value : undefined,
                    });
                  }}
                  onBlur={(e) => {
                    const trimmed = e.target.value.trim();
                    if (trimmed !== (c.rewardHeadline ?? "")) {
                      onUpdate(i, {
                        rewardHeadline: trimmed.length > 0 ? trimmed : undefined,
                      });
                    }
                  }}
                />
              </label>
            </div>
            );
          })
        )}
        <div className="toolbar">
          <button type="button" className="btn ghost sm" onClick={onAdd} disabled={saving}>
            + Add card
          </button>
        </div>
      </fieldset>
    </div>
  );
}
