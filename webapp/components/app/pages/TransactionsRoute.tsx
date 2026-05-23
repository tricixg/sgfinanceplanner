"use client";

import { Suspense } from "react";
import { TransactionsHistoryPage } from "@/components/savings/TransactionsHistoryPage";

export function TransactionsRoute() {
  return (
    <Suspense fallback={<p className="loading">Loading…</p>}>
      <TransactionsHistoryPage />
    </Suspense>
  );
}
