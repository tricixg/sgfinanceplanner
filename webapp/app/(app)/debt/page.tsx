import dynamic from "next/dynamic";

const DebtRoute = dynamic(
  () =>
    import("@/components/app/pages/SimpleDomainRoutes").then((m) => ({
      default: m.DebtRoute,
    })),
  { ssr: false, loading: () => <p className="loading">Loading…</p> }
);

export default function DebtPage() {
  return <DebtRoute />;
}
