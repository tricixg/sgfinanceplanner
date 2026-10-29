"use client";

import { TabOncall } from "@/components/tabs/TabOncall";
import { useAppSession } from "@/contexts/AppSessionContext";

export function OncallRoute() {
  const user = useAppSession();
  return <TabOncall enabled={Boolean(user?.id)} />;
}
