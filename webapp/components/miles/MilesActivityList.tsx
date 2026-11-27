"use client";

import { useState } from "react";
import type { MilesAction } from "@/lib/miles/ledger";
import { expiryDateLabel, monthLabel } from "@/lib/miles/months";
import { MILES_PROGRAMS } from "@/lib/miles/programs";
import type { MilesActivity } from "@/lib/miles/types";
import { errorMessage } from "@/lib/ui/notify";
import { fmt, fmtFee } from "@/components/miles/format";

type Props = {
  activity: MilesActivity[];
  mutate: (action: MilesAction) => Promise<void>;
  disabled?: boolean;
};

/** Conversions and redemptions, newest first, each with Undo. */
export function MilesActivityList({ activity, mutate, disabled }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!activity.length) {
    return (
      <p className="note">No conversions or redemptions yet. Use the Conversion or Redemption tab above to log one.</p>
    );
  }

  const undo = async (id: string) => {
    setBusyId(id);
    setErrors({});
    try {
      await mutate({ action: "undo", activityId: id });
    } catch (e) {
      console.error("[MilesActivityList] undo failed", e);
      setErrors({ [id]: errorMessage(e, "Couldn't undo that. Please try again.") });
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...activity].sort((a, b) => b.month - a.month || b.createdAt.localeCompare(a.createdAt));
  const fees = activity.filter((a) => a.kind === "convert").reduce((s, a) => s + a.fee, 0);

  return (
    <ul className="mt-acts">
      {sorted.map((a) => {
        const rule = MILES_PROGRAMS[a.program];
        return (
          <li key={a.id}>
            <span className="mt-acts-when">{monthLabel(a.month)}</span>
            <span className="mt-acts-what">
              {a.kind === "convert" ? (
                <>
                  <b>
                    Converted {fmt(a.amount)} {rule.unit}
                  </b>{" "}
                  from {rule.name} into {fmt(a.miles)} KrisFlyer miles
                  <span className="mt-sub">
                    Fee {fmtFee(a.fee)} · miles valid until {expiryDateLabel(a.month + 36)}
                  </span>
                </>
              ) : (
                <>
                  <b>Redeemed {fmt(a.miles)} KrisFlyer miles</b>
                  {a.description ? ` for ${a.description}` : ""}
                  <span className="mt-sub">Taken from your oldest miles first</span>
                </>
              )}
              {errors[a.id] ? (
                <span className="mt-form-error" role="alert">
                  {errors[a.id]}
                </span>
              ) : null}
            </span>
            <button type="button" className="btn ghost sm" disabled={disabled || busyId !== null} onClick={() => void undo(a.id)}>
              {busyId === a.id ? "Undoing…" : "Undo"}
            </button>
          </li>
        );
      })}
      {fees ? (
        <li className="mt-acts-foot">
          <span />
          <span className="note">Conversion fees so far: {fmtFee(fees)}</span>
          <span />
        </li>
      ) : null}
    </ul>
  );
}
