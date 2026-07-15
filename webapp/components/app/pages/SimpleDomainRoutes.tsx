"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabCards } from "@/components/tabs/TabCards";
import { TabDebt } from "@/components/tabs/TabDebt";
import { TabCPF } from "@/components/tabs/TabCPF";
import { TabBTO } from "@/components/tabs/TabBTO";
import { TabMiles } from "@/components/tabs/TabMiles";

export function CardsRoute() {
  return (
    <DomainPage>
      {({ state, setState, cardsApi }) => (
        <TabCards state={state} setState={setState} cardsApi={cardsApi} />
      )}
    </DomainPage>
  );
}

export function DebtRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <TabDebt state={state} setState={setState} />}
    </DomainPage>
  );
}

export function CpfRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <TabCPF state={state} setState={setState} />}
    </DomainPage>
  );
}

export function BtoRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <TabBTO state={state} setState={setState} />}
    </DomainPage>
  );
}

export function MilesRoute() {
  return (
    <DomainPage>
      {({ state, setState }) => <TabMiles state={state} setState={setState} />}
    </DomainPage>
  );
}
