import dynamic from "next/dynamic";

const NowRoute = dynamic(
  () =>
    import("@/components/app/pages/NowRoute").then((m) => ({
      default: m.NowRoute,
    })),
  { ssr: false, loading: () => <p className="loading">Loading…</p> }
);

export default function NowPage() {
  return <NowRoute />;
}
