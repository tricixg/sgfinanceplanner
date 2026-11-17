"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { FinancialHealthPage } from "@/components/health/FinancialHealthPage";

export function FinancialHealthRoute() {
  return (
    <DomainPage>
      {({ state, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <FinancialHealthPage state={state} />
        )
      }
    </DomainPage>
  );
}
