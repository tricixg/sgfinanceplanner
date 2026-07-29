"use client";

import { TabPastCashflow } from "@/components/tabs/TabPastCashflow";
import { useAppSession } from "@/contexts/AppSessionContext";

export function PastCashflowRoute() {
  const user = useAppSession();
  return <TabPastCashflow enabled={Boolean(user?.id)} />;
}
