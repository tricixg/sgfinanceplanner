"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt2 } from "@/lib/finance/helpers";
import type { SpendingAnalyticsBundle } from "@/lib/spending/analytics";
import { SpendingStackedBarChart } from "./SpendingStackedBarChart";

const ALL_ACCOUNTS_ID = "__all__";

type Props = {
  analytics: SpendingAnalyticsBundle;
};

export function SpendingCategoryChart({ analytics }: Props) {
  const accounts = analytics.perAccount;
  const grandTotal = analytics.monthly.reduce((s, m) => s + m.total, 0);
  const [accountId, setAccountId] = useState(ALL_ACCOUNTS_ID);

  useEffect(() => {
    if (accountId === ALL_ACCOUNTS_ID) return;
    const stillValid = accounts.some((a) => a.accountId === accountId);
    if (!stillValid) {
      setAccountId(ALL_ACCOUNTS_ID);
      console.info("[SpendingCategoryChart] reset to all — account no longer in data");
    }
  }, [accounts, accountId]);

  const monthly = useMemo(() => {
    if (accountId === ALL_ACCOUNTS_ID) return analytics.monthly;
    return accounts.find((a) => a.accountId === accountId)?.monthly ?? analytics.monthly;
  }, [accountId, accounts, analytics.monthly]);

  const hasData = grandTotal > 0 || accounts.length > 0;
  if (!hasData) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Spend by category (5 months)</h3>
        <p className="note">No spending data in this period.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="ctrl"
        style={{ marginBottom: 12, justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <h3 style={{ margin: 0 }}>Spend by category (5 months)</h3>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>Card / account</span>
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              console.info("[SpendingCategoryChart] selected", e.target.value);
            }}
          >
            <option value={ALL_ACCOUNTS_ID}>All ({fmt2(grandTotal)})</option>
            {accounts.map((a) => (
              <option key={a.accountId} value={a.accountId}>
                {a.label} ({fmt2(a.total)})
              </option>
            ))}
          </select>
        </label>
      </div>
      <SpendingStackedBarChart
        title=""
        monthly={monthly}
        dimension="byCategory"
        embedded
      />
    </div>
  );
}
