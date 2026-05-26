"use client";

import { PokerStatsPage } from "@/components/poker/PokerStatsPage";
import { useAppSession } from "@/contexts/AppSessionContext";

export function PokerStatsRoute() {
  const user = useAppSession();
  return <PokerStatsPage enabled={Boolean(user?.id)} />;
}
