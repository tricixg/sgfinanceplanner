"use client";

import { Suspense } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { TransactionsHistoryPage } from "@/components/savings/TransactionsHistoryPage";

export default function TransactionsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<p className="loading wrap">Loading…</p>}>
        <TransactionsHistoryPage />
      </Suspense>
    </RequireAuth>
  );
}
