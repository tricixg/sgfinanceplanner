"use client";

import { useMemo } from "react";
import { DecimalTextInput } from "@/components/DecimalInput";
import { fmt2 } from "@/lib/finance/helpers";
import { roundMoney } from "@/lib/travel/split";
import type { TravelCompanion, TravelSplitInput } from "@/lib/travel/types";

type Props = {
  companions: TravelCompanion[];
  totalAmount: number;
  splitEnabled: boolean;
  onSplitEnabledChange: (v: boolean) => void;
  paidByCompanionId: string | null;
  onPaidByCompanionIdChange: (id: string | null) => void;
  myShare: string;
  onMyShareChange: (v: string) => void;
  companionShares: Record<string, string>;
  onCompanionShareChange: (companionId: string, v: string) => void;
  selectedCompanionIds: string[];
  onSelectedCompanionIdsChange: (ids: string[]) => void;
};

export function buildSplitPayload(
  splitEnabled: boolean,
  totalAmount: number,
  paidByCompanionId: string | null,
  myShare: string,
  companionShares: Record<string, string>,
  selectedCompanionIds: string[]
): TravelSplitInput | undefined {
  if (!splitEnabled || !(totalAmount > 0)) return undefined;

  const shares: TravelSplitInput["shares"] = [
    { companionId: null, shareAmount: roundMoney(Number(myShare) || 0) },
  ];

  for (const id of selectedCompanionIds) {
    shares.push({
      companionId: id,
      shareAmount: roundMoney(Number(companionShares[id]) || 0),
    });
  }

  return { paidByCompanionId, shares };
}

export function TravelExpenseSplitFields({
  companions,
  totalAmount,
  splitEnabled,
  onSplitEnabledChange,
  paidByCompanionId,
  onPaidByCompanionIdChange,
  myShare,
  onMyShareChange,
  companionShares,
  onCompanionShareChange,
  selectedCompanionIds,
  onSelectedCompanionIdsChange,
}: Props) {
  const shareSum = useMemo(() => {
    let sum = Number(myShare) || 0;
    for (const id of selectedCompanionIds) {
      sum += Number(companionShares[id]) || 0;
    }
    return roundMoney(sum);
  }, [myShare, companionShares, selectedCompanionIds]);

  const splitMismatch =
    splitEnabled && totalAmount > 0 && Math.abs(shareSum - totalAmount) > 0.005;

  const splitEqually = () => {
    const ids =
      selectedCompanionIds.length > 0 ? selectedCompanionIds : companions.map((c) => c.id);
    if (ids.length === 0) return;
    const parts = ids.length + 1;
    const each = roundMoney(totalAmount / parts);
    const remainder = roundMoney(totalAmount - each * parts);
    onMyShareChange(String(each + remainder));
    onSelectedCompanionIdsChange(ids);
    for (const id of ids) {
      onCompanionShareChange(id, String(each));
    }
  };

  const toggleCompanion = (id: string, checked: boolean) => {
    if (checked) {
      onSelectedCompanionIdsChange([...selectedCompanionIds, id]);
    } else {
      onSelectedCompanionIdsChange(selectedCompanionIds.filter((x) => x !== id));
      onCompanionShareChange(id, "");
    }
  };

  return (
    <div
      className={`travel-expense-split ${splitEnabled ? "travel-expense-split--on" : "travel-expense-split--off"}`}
    >
      <div className="travel-expense-split-bar">
        <span className="travel-expense-split-label">Split</span>
        <div className="poker-fx-segment" role="group" aria-label="Split expense">
          <button
            type="button"
            className={!splitEnabled ? "active" : undefined}
            onClick={() => onSplitEnabledChange(false)}
          >
            No
          </button>
          <button
            type="button"
            className={splitEnabled ? "active" : undefined}
            onClick={() => onSplitEnabledChange(true)}
          >
            Yes
          </button>
        </div>
        {splitEnabled ? (
          <>
            <label className="travel-expense-split-paid">
              <span className="travel-expense-split-label">Paid by</span>
              <select
                value={paidByCompanionId ?? ""}
                onChange={(e) =>
                  onPaidByCompanionIdChange(e.target.value ? e.target.value : null)
                }
              >
                <option value="">Me</option>
                {companions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {companions.length > 0 ? (
              <button
                type="button"
                className="btn ghost sm"
                onClick={splitEqually}
                disabled={!(totalAmount > 0)}
              >
                Equal
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {splitEnabled ? (
        companions.length === 0 ? (
          <p className="note travel-expense-split-hint">
            Add people via the People button to split.
          </p>
        ) : (
          <div className="travel-expense-split-shares">
            <table className="travel-expense-split-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>You (budget)</td>
                  <td className="num">
                    <DecimalTextInput value={myShare} onChange={onMyShareChange} placeholder="0" />
                  </td>
                </tr>
                {companions.map((c) => {
                  const selected = selectedCompanionIds.includes(c.id);
                  const checkboxId = `split-companion-${c.id}`;
                  return (
                    <tr
                      key={c.id}
                      className={selected ? undefined : "travel-expense-split-row--off"}
                    >
                      <td>
                        <span className="travel-expense-split-person">
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={selected}
                            onChange={(e) => toggleCompanion(c.id, e.target.checked)}
                          />
                          <label htmlFor={checkboxId}>{c.name}</label>
                        </span>
                      </td>
                      <td className="num">
                        {selected ? (
                          <DecimalTextInput
                            value={companionShares[c.id] ?? ""}
                            onChange={(v) => onCompanionShareChange(c.id, v)}
                            placeholder="0"
                          />
                        ) : (
                          <span className="note">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={`note travel-expense-split-total ${splitMismatch ? "travel-split-mismatch" : ""}`}>
              Total {fmt2(shareSum)} / {fmt2(totalAmount)}
              {splitMismatch ? " · must match amount" : ""}
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
