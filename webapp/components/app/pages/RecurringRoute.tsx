"use client";

import { TabRecurring } from "@/components/tabs/TabRecurring";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useAppData } from "@/hooks/useAppData";

export function RecurringRoute() {
  const user = useAppSession();
  const { reload } = useAppData();
  return <TabRecurring enabled={Boolean(user?.id)} onReload={reload} />;
}
