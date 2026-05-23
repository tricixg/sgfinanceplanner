"use client";

import { TabPoker } from "@/components/tabs/TabPoker";
import { useAppSession } from "@/contexts/AppSessionContext";

export function PokerRoute() {
  const user = useAppSession();
  return <TabPoker enabled={Boolean(user?.id)} />;
}
