"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { domainsForPath, lazyDomainsForPath } from "@/lib/app/domains";
import { useAppDataProvider } from "@/hooks/useAppData";
import { useSavingsProvider } from "@/hooks/useSavings";
import { useAccountsProvider } from "@/hooks/useAccounts";
import { useFundsProvider } from "@/hooks/useFunds";
import { useMilesProvider } from "@/hooks/useMiles";
import { useHouseholdProvider } from "@/hooks/useHousehold";
import { useFinancialAccountsProvider } from "@/hooks/useFinancialAccounts";
import { useBenefitsProvider } from "@/hooks/useBenefits";
import { useOutstandingCardStatementsProvider } from "@/hooks/useOutstandingCardStatements";
import {
  AccountsContext,
  AppDataContext,
  BenefitsContext,
  FinancialAccountsContext,
  FundsContext,
  MilesContext,
  HouseholdContext,
  OutstandingCardStatementsContext,
  SavingsContext,
} from "@/contexts/app-data-contexts";

type Props = {
  userId: string | undefined;
  children: React.ReactNode;
};

/** Session-scoped data cache — fetch once per sign-in, shared across routes. */
export function AppDataProvider({ userId, children }: Props) {
  const enabled = Boolean(userId);
  // Load only the domains this route needs (lib/app/domains.ts); others load when first read.
  const pathname = usePathname();
  const needs = domainsForPath(pathname);
  const appData = useAppDataProvider(enabled, needs);
  const savings = useSavingsProvider(enabled);
  const accounts = useAccountsProvider(enabled);
  const funds = useFundsProvider(enabled);
  const miles = useMilesProvider(enabled);
  const household = useHouseholdProvider(enabled);
  const financialAccounts = useFinancialAccountsProvider(enabled);
  const benefits = useBenefitsProvider(enabled);
  const outstandingCardStatements = useOutstandingCardStatementsProvider(enabled);

  // Start the page's lazily-loaded data on route entry, in parallel with its core data, instead
  // of when its content mounts after core finished (each provider's ensureLoaded is idempotent).
  const ensureByName = {
    savings: savings.ensureLoaded,
    accounts: accounts.ensureLoaded,
    funds: funds.ensureLoaded,
    miles: miles.ensureLoaded,
    household: household.ensureLoaded,
    financialAccounts: financialAccounts.ensureLoaded,
  };
  const lazyKey = lazyDomainsForPath(pathname).join(",");
  useEffect(() => {
    if (!enabled || !lazyKey) return;
    for (const name of lazyKey.split(",") as (keyof typeof ensureByName)[]) ensureByName[name]();
    // ensureLoaded functions are stable per provider; lazyKey changes with the route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lazyKey]);

  useEffect(() => {
    console.info("[AppDataProvider] mounted", { userId: userId ?? null, enabled });
  }, [userId, enabled]);

  return (
    <AppDataContext.Provider value={appData}>
      <SavingsContext.Provider value={savings}>
        <AccountsContext.Provider value={accounts}>
          <FundsContext.Provider value={funds}>
            <MilesContext.Provider value={miles}>
              <HouseholdContext.Provider value={household}>
                <FinancialAccountsContext.Provider value={financialAccounts}>
                  <BenefitsContext.Provider value={benefits}>
                    <OutstandingCardStatementsContext.Provider
                      value={outstandingCardStatements}
                    >
                      {children}
                    </OutstandingCardStatementsContext.Provider>
                  </BenefitsContext.Provider>
                </FinancialAccountsContext.Provider>
              </HouseholdContext.Provider>
            </MilesContext.Provider>
          </FundsContext.Provider>
        </AccountsContext.Provider>
      </SavingsContext.Provider>
    </AppDataContext.Provider>
  );
}
