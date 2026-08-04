"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { fetchJson } from "@/lib/fetch-json";
import type { PokerStatsBundle } from "@/lib/poker/stats";
import { locationDetailStats } from "@/lib/poker/stats";
import { PokerStatsOverview } from "@/components/poker/stats/PokerStatsOverview";
import { PokerStatsSessions } from "@/components/poker/stats/PokerStatsSessions";
import { PokerStatsLocations } from "@/components/poker/stats/PokerStatsLocations";
import { PokerStatsLocationDetail } from "@/components/poker/stats/PokerStatsLocationDetail";
import { PokerStatsTournaments } from "@/components/poker/stats/PokerStatsTournaments";
import { PokerStatsCharts } from "@/components/poker/stats/PokerStatsCharts";
import { PokerStatsTrends } from "@/components/poker/stats/PokerStatsTrends";
import { dispatchDomainEvent } from "@/lib/events/domain-events";

export type PokerStatsTab =
  | "overview"
  | "sessions"
  | "tournaments"
  | "locations"
  | "charts"
  | "trends";

const TABS: { id: PokerStatsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sessions", label: "Sessions" },
  { id: "tournaments", label: "Tournaments" },
  { id: "locations", label: "Locations" },
  { id: "charts", label: "Cash charts" },
  { id: "trends", label: "Trends" },
];

export function PokerStatsPage({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as PokerStatsTab | null;
  const locationParam = searchParams.get("location");

  const [stats, setStats] = useState<PokerStatsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const activeTab: PokerStatsTab =
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : "overview";

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError("");
    try {
      const { res, data } = await fetchJson<{
        stats?: PokerStatsBundle;
        error?: string;
      }>("/api/poker/stats", { credentials: "include" });
      if (!res.ok) throw new Error(data.error ?? "Failed to load statistics");
      if (!data.stats) throw new Error("No statistics returned");
      setStats(data.stats);
      console.info("[PokerStatsPage] loaded", {
        sessions: data.stats.sessions.length,
      });
    } catch (e) {
      console.error("[PokerStatsPage] load failed", e);
      setError(e instanceof Error ? e.message : "Failed to load");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const setTab = (tab: PokerStatsTab, location?: string) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (location) params.set("location", location);
    router.replace(`/poker/stats?${params.toString()}`);
  };

  const locationDetail = useMemo(() => {
    if (!stats || !locationParam || activeTab !== "locations") return null;
    return locationDetailStats(stats.sessions, decodeURIComponent(locationParam));
  }, [stats, locationParam, activeTab]);

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to view poker statistics.</p>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div
        className="toolbar poker-stats-toolbar"
        style={{ marginBottom: 16, marginTop: 0, width: "100%" }}
      >
        <div className="poker-stats-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={activeTab === t.id ? "btn sm" : "btn ghost sm"}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Link href="/poker" className="btn ghost sm poker-stats-back">
          ← Log sessions
        </Link>
      </div>

      {loading ? (
        <p className="loading">Loading statistics…</p>
      ) : error ? (
        <p className="note">{error}</p>
      ) : !stats ? (
        <p className="note">No data.</p>
      ) : activeTab === "overview" ? (
        <PokerStatsOverview stats={stats} />
      ) : activeTab === "sessions" ? (
        <PokerStatsSessions
          sessions={stats.sessions}
          onSessionUpdated={(updated) => {
            setStats((prev) =>
              prev
                ? {
                    ...prev,
                    sessions: prev.sessions.map((s) => (s.id === updated.id ? updated : s)),
                  }
                : prev
            );
            void load();
            console.info("[PokerStatsPage] session updated", { id: updated.id });
          }}
          onSessionDeleted={(id) => {
            setStats((prev) =>
              prev
                ? {
                    ...prev,
                    sessions: prev.sessions.filter((s) => s.id !== id),
                  }
                : prev
            );
            void load();
            console.info("[PokerStatsPage] session deleted", { id });
          }}
          onImported={({ imported, ledgerSynced }) => {
            void load();
            if (ledgerSynced) {
              dispatchDomainEvent("savings:changed");
            }
            console.info("[PokerStatsPage] import applied", { imported, ledgerSynced });
          }}
        />
      ) : activeTab === "tournaments" ? (
        <PokerStatsTournaments stats={stats} />
      ) : activeTab === "locations" ? (
        locationDetail ? (
          <PokerStatsLocationDetail
            detail={locationDetail}
            onBack={() => setTab("locations")}
          />
        ) : (
          <PokerStatsLocations
            locations={stats.locations}
            onSelect={(loc) => setTab("locations", loc)}
          />
        )
      ) : activeTab === "charts" ? (
        <PokerStatsCharts stats={stats} />
      ) : (
        <PokerStatsTrends sessions={stats.sessions} />
      )}
    </section>
  );
}
