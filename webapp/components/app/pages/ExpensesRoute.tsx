"use client";

import { TabExpenses } from "@/components/tabs/TabExpenses";
import { useAppSession } from "@/contexts/AppSessionContext";

export function ExpensesRoute() {
  const user = useAppSession();
  return <TabExpenses enabled={Boolean(user?.id)} />;
}
