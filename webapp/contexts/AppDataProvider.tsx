"use client";

import { useEffect } from "react";
import { useAppDataProvider } from "@/hooks/useAppData";
import { useSavingsProvider } from "@/hooks/useSavings";
import { useAccountsProvider } from "@/hooks/useAccounts";
import { useFundsProvider } from "@/hooks/useFunds";
import { useHouseholdProvider } from "@/hooks/useHousehold";
import { useFinancialAccountsProvider } from "@/hooks/useFinancialAccounts";
import {
  AccountsContext,
  AppDataContext,
  FinancialAccountsContext,
  FundsContext,
  HouseholdContext,
  SavingsContext,
} from "@/contexts/app-data-contexts";

type Props = {
  userId: string | undefined;
  children: React.ReactNode;
};

/** Session-scoped data cache — fetch once per sign-in, shared across routes. */
export function AppDataProvider({ userId, children }: Props) {
  const enabled = Boolean(userId);
  const appData = useAppDataProvider(enabled);
  const savings = useSavingsProvider(enabled);
  const accounts = useAccountsProvider(enabled);
  const funds = useFundsProvider(enabled);
  const household = useHouseholdProvider(enabled);
  const financialAccounts = useFinancialAccountsProvider(enabled);

  useEffect(() => {
    console.info("[AppDataProvider] mounted", { userId: userId ?? null, enabled });
  }, [userId, enabled]);

  return (
    <AppDataContext.Provider value={appData}>
      <SavingsContext.Provider value={savings}>
        <AccountsContext.Provider value={accounts}>
          <FundsContext.Provider value={funds}>
            <HouseholdContext.Provider value={household}>
              <FinancialAccountsContext.Provider value={financialAccounts}>
                {children}
              </FinancialAccountsContext.Provider>
            </HouseholdContext.Provider>
          </FundsContext.Provider>
        </AccountsContext.Provider>
      </SavingsContext.Provider>
    </AppDataContext.Provider>
  );
}
