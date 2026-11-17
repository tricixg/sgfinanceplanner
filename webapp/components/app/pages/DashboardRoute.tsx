"use client";

import { Suspense } from "react";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { useAppSession } from "@/contexts/AppSessionContext";

export function DashboardRoute() {
  const user = useAppSession();
  return (
    // DashboardPage reads the selected month from the URL (useSearchParams).
    <Suspense fallback={<p className="loading">Loading…</p>}>
      <DashboardPage enabled={Boolean(user?.id)} />
    </Suspense>
  );
}
