import dynamic from "next/dynamic";

const WealthRoute = dynamic(
  () =>
    import("@/components/app/pages/WealthRoute").then((m) => ({
      default: m.WealthRoute,
    })),
  { ssr: false, loading: () => <p className="loading">Loading…</p> }
);

export default function WealthPage() {
  return <WealthRoute />;
}
