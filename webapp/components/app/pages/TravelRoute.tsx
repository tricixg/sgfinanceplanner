"use client";

import { DomainPage } from "@/components/app/DomainPage";
import { TabTravel } from "@/components/tabs/TabTravel";
import { TabTravelTrip } from "@/components/tabs/TabTravelTrip";
import { useAppSession } from "@/contexts/AppSessionContext";

export function TravelRoute() {
  const user = useAppSession();
  return (
    <DomainPage>
      {() => <TabTravel enabled={Boolean(user)} />}
    </DomainPage>
  );
}

export function TravelTripRoute({ tripId }: { tripId: string }) {
  const user = useAppSession();
  return (
    <DomainPage>
      {() => <TabTravelTrip tripId={tripId} enabled={Boolean(user)} />}
    </DomainPage>
  );
}
