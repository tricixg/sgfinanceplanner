"use client";

import { useCallback, useState } from "react";
import { createEmptyState } from "@/lib/finance/defaults";
import { DomainPage } from "@/components/app/DomainPage";
import { TabMe } from "@/components/tabs/TabMe";
import { useAppSession } from "@/contexts/AppSessionContext";
import { useHousehold } from "@/hooks/useHousehold";
import { usePageSavings } from "@/hooks/usePageSavings";

function MeContent({
  state,
  setState,
}: {
  state: Parameters<typeof TabMe>[0]["state"];
  setState: Parameters<typeof TabMe>[0]["setState"];
}) {
  const user = useAppSession();
  const household = useHousehold();
  const { savingsApi, accountsApi } = usePageSavings(user?.id, state);
  const [saveMsg, setSaveMsg] = useState("");

  const flash = useCallback((msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(""), 2500);
  }, []);

  const flashError = useCallback((msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(""), 4000);
  }, []);

  const handleReset = () => {
    setState(createEmptyState());
    flash("Reset to blank (all zeros)");
    console.info("[MeRoute] reset to empty state");
  };

  const onPartnerUnlinked = useCallback(async () => {
    await Promise.all([savingsApi.reload(), accountsApi.reload()]);
    console.info("[MeRoute] reloaded savings after partner unlink");
  }, [savingsApi, accountsApi]);

  return (
    <TabMe
      state={state}
      setState={setState}
      onApply={() => flash("Charts updated")}
      onSaveNow={() => flash("Salary saved")}
      onSaveError={flashError}
      onReset={handleReset}
      saveMsg={saveMsg}
      userEmail={user?.email ?? undefined}
      hasPassword={user?.hasPassword}
      household={household}
      onPartnerUnlinked={onPartnerUnlinked}
      authEnabled={Boolean(user)}
    />
  );
}

export function MeRoute() {
  return (
    <DomainPage>
      {({ state, setState, loading }) =>
        loading ? (
          <p className="loading">Loading your financial data…</p>
        ) : (
          <MeContent state={state} setState={setState} />
        )
      }
    </DomainPage>
  );
}
