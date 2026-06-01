"use client";

import type { CreditCard } from "@/lib/types";
import type { CardStatementComputed } from "@/lib/cards/types";
import { fmt2 } from "@/lib/finance/helpers";
import { DecimalTextInput } from "@/components/DecimalInput";
import { InlineConfirm } from "@/components/InlineConfirm";
import { fmtCardDate } from "@/components/credit-cards/card-ui";

type Props = {
  cards: CreditCard[];
  statementByCardKey: Map<string, CardStatementComputed>;
  draftActual: Record<string, string>;
  onDraftActualChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  draftMinDue: Record<string, string>;
  onDraftMinDueChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingRow: string | null;
  undoingRow: string | null;
  savingConfig: boolean;
  onSaveRow: (stmt: CardStatementComputed) => void;
  onUndoPayment: (stmt: CardStatementComputed) => void;
  onPay: (stmt: CardStatementComputed) => void;
  confirmUndoStatementId: string | null;
  onRequestUndoPayment: (stmt: CardStatementComputed) => void;
  onCancelUndoPayment: () => void;
};

export function CardStatementList({
  cards,
  statementByCardKey,
  draftActual,
  onDraftActualChange,
  draftMinDue,
  onDraftMinDueChange,
  savingRow,
  undoingRow,
  savingConfig,
  onSaveRow,
  onUndoPayment,
  onPay,
  confirmUndoStatementId,
  onRequestUndoPayment,
  onCancelUndoPayment,
}: Props) {
  if (cards.length === 0) {
    return (
      <p className="note" style={{ fontStyle: "italic" }}>
        Add a card above to track statements.
      </p>
    );
  }

  return (
    <div className="card table-scroll">
      <table>
        <thead>
          <tr>
            <th>Card</th>
            <th>Statement</th>
            <th>Due</th>
            <th>Statement amt</th>
            <th>Min due</th>
            <th>Outstanding</th>
            <th>Tracked</th>
            <th>Untracked</th>
            <th>Paid</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cards.map((c) => {
            const cardKey = c.id ?? c.name;
            const stmt = statementByCardKey.get(cardKey);
            const rowSaving = stmt != null && savingRow === stmt.id;
            const rowUndoing = stmt != null && undoingRow === stmt.id;

            return (
              <tr key={cardKey} className={stmt?.isOverdue ? "row-overdue" : undefined}>
                <td>
                  {c.name}
                  {stmt ? (
                    <div className="note">
                      {fmtCardDate(stmt.cycleStartDate)} – {fmtCardDate(stmt.cycleEndDate)}
                      {stmt.carriedForwardIn > 0
                        ? ` · carried ${fmt2(stmt.carriedForwardIn)}`
                        : ""}
                    </div>
                  ) : (
                    <div className="note">Syncing statement…</div>
                  )}
                </td>
                <td>{stmt ? fmtCardDate(stmt.statementCloseDate) : "—"}</td>
                <td>{stmt ? fmtCardDate(stmt.paymentDueDate) : `Day ${c.paymentDueDay}`}</td>
                <td className="num">
                  {stmt && !stmt.paidAt ? (
                    <DecimalTextInput
                      style={{ width: 88 }}
                      disabled={rowSaving}
                      value={
                        draftActual[stmt.id] ??
                        (stmt.actualAmount != null ? String(stmt.actualAmount) : "")
                      }
                      placeholder="Add"
                      onChange={(v) =>
                        onDraftActualChange((prev) => ({ ...prev, [stmt.id]: v }))
                      }
                    />
                  ) : stmt ? (
                    fmt2(stmt.actualAmount ?? 0)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">
                  {stmt && !stmt.paidAt ? (
                    <DecimalTextInput
                      style={{ width: 88 }}
                      disabled={rowSaving}
                      value={
                        draftMinDue[stmt.id] ??
                        (stmt.minimumDue != null ? String(stmt.minimumDue) : "")
                      }
                      placeholder="Add"
                      onChange={(v) =>
                        onDraftMinDueChange((prev) => ({ ...prev, [stmt.id]: v }))
                      }
                    />
                  ) : stmt?.minimumDue != null ? (
                    fmt2(stmt.minimumDue)
                  ) : (
                    "—"
                  )}
                </td>
                <td className="num">{stmt ? fmt2(stmt.outstandingBalance) : "—"}</td>
                <td className="num">{stmt ? fmt2(stmt.trackedAmount) : "—"}</td>
                <td className="num">
                  {stmt?.untrackedAmount != null ? fmt2(stmt.untrackedAmount) : "—"}
                </td>
                <td>
                  {stmt?.paidAt
                    ? `Yes ${fmt2(stmt.amountPaid)}`
                    : stmt && stmt.amountPaid > 0
                      ? `Partial ${fmt2(stmt.amountPaid)}`
                      : "No"}
                </td>
                <td>
                  {stmt ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {!stmt.paidAt ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={rowSaving || rowUndoing || savingConfig}
                          onClick={() => onSaveRow(stmt)}
                        >
                          {rowSaving ? "Saving…" : "Save"}
                        </button>
                      ) : null}
                      {!stmt.paidAt &&
                      (stmt.outstandingBalance > 0 ||
                        (stmt.actualAmount != null && stmt.actualAmount > 0)) ? (
                        <button
                          type="button"
                          className="btn sm"
                          disabled={rowSaving || rowUndoing || savingConfig}
                          onClick={() => onPay(stmt)}
                        >
                          Pay
                        </button>
                      ) : null}
                      {stmt.amountPaid > 0 ? (
                        confirmUndoStatementId === stmt.id ? (
                          <InlineConfirm
                            prompt={`Undo payment for ${stmt.cardName}?`}
                            confirmLabel="Undo payment"
                            busy={rowUndoing}
                            onConfirm={() => onUndoPayment(stmt)}
                            onCancel={onCancelUndoPayment}
                          />
                        ) : (
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={
                              rowSaving ||
                              rowUndoing ||
                              savingConfig ||
                              !stmt.paymentSavingsTransactionId
                            }
                            title={
                              stmt.paymentSavingsTransactionId
                                ? "Undo latest statement payment"
                                : "Undo unavailable for unlinked/legacy payments"
                            }
                            onClick={() => onRequestUndoPayment(stmt)}
                          >
                            Undo payment
                          </button>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
