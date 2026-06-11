"use client";

import { TabPastSpendings } from "@/components/tabs/TabPastSpendings";
import { useAppSession } from "@/contexts/AppSessionContext";

export function PastSpendingsRoute() {
  const user = useAppSession();
  return <TabPastSpendings enabled={Boolean(user?.id)} />;
}
