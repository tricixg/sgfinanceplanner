"use client";

import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { useAppSession } from "@/contexts/AppSessionContext";

export function DashboardRoute() {
  const user = useAppSession();
  return <DashboardPage enabled={Boolean(user?.id)} />;
}
