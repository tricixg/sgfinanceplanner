import dynamic from "next/dynamic";

const YearRoute = dynamic(
  () =>
    import("@/components/app/pages/YearRoute").then((m) => ({
      default: m.YearRoute,
    })),
  { ssr: false, loading: () => <p className="loading">Loading…</p> }
);

export default function YearPage() {
  return <YearRoute />;
}
