"use client";

import type { DashboardState } from "@/lib/types";
import type { SavingsBundle } from "@/lib/savings/types";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
  savings: SavingsBundle | null;
  className?: string;
};

export function IncludeJointSavingsToggle({
  state,
  setState,
  savings,
  className,
}: Props) {
  if (!savings?.paired || savings.totals.jointCash <= 0) {
    return null;
  }

  const checked = Boolean(state.prefs?.includeJointSavings);

  return (
    <label className={`card-outstanding-toggle ${className ?? ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          const on = e.target.checked;
          setState((prev) => ({
            ...prev,
            prefs: { ...prev.prefs, includeJointSavings: on },
          }));
          console.info("[IncludeJointSavingsToggle]", { includeJoint: on });
        }}
      />
      Include joint savings ({savings.totals.jointCash.toLocaleString("en-SG", {
        style: "currency",
        currency: "SGD",
        maximumFractionDigits: 0,
      })}) in net worth, cashflow, and projections
    </label>
  );
}
