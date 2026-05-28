import { TravelTripRoute } from "@/components/app/pages/TravelRoute";

type Props = { params: Promise<{ id: string }> };

export default async function TravelTripPage({ params }: Props) {
  const { id } = await params;
  return <TravelTripRoute tripId={id} />;
}
