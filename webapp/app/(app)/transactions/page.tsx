"use client";

import { Suspense } from "react";
import { TransactionsHistoryPage } from "@/components/savings/TransactionsHistoryPage";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="loading">Loading…</p>}>
      <TransactionsHistoryPage />
    </Suspense>
  );
}
