"use client";

import { TabBenefits } from "@/components/tabs/TabBenefits";
import { useAppSession } from "@/contexts/AppSessionContext";

export function BenefitsRoute() {
  const user = useAppSession();
  return <TabBenefits enabled={Boolean(user?.id)} />;
}
