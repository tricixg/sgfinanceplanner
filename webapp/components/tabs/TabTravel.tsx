"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { fmt2 } from "@/lib/finance/helpers";
import type { TravelTripSummary } from "@/lib/travel/types";

type Props = { enabled: boolean };

function currentYear(): number {
  return new Date().getFullYear();
}

export function TabTravel({ enabled }: Props) {
  const router = useRouter();
  const [year, setYear] = useState(currentYear());
  const [items, setItems] = useState<TravelTripSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totals, setTotals] = useState({ budgeted: 0, spent: 0 });

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [msg, setMsg] = useState("");
  const [openingTrip, setOpeningTrip] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    void (async () => {
      const { res, data } = await fetchJson<{
        items?: TravelTripSummary[];
        totals?: { budgeted: number; spent: number };
        error?: string;
      }>(`/api/travel/trips?year=${year}`, { credentials: "include" });
      if (!res.ok) {
        setMsg(data.error ?? "Failed to load trips");
        setItems([]);
        setTotals({ budgeted: 0, spent: 0 });
      } else {
        setItems(data.items ?? []);
        setTotals(data.totals ?? { budgeted: 0, spent: 0 });
      }
      setLoading(false);
    })();
  }, [enabled, year]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !country.trim() || !startDate || !endDate) {
      setMsg("Enter country, trip name, and date range");
      return;
    }
    setSaving(true);
    setOpeningTrip(false);
    setMsg("");
    const { res, data } = await fetchJson<{ item?: { id: string }; error?: string }>(
      "/api/travel/trips",
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          country,
          startDate,
          endDate,
        }),
      }
    );
    setSaving(false);
    if (!res.ok || !data.item?.id) {
      setMsg(data.error ?? "Failed to create trip");
      return;
    }
    setOpeningTrip(true);
    router.push(`/travel/${data.item.id}`);
  };

  const net = useMemo(() => totals.budgeted - totals.spent, [totals]);

  if (!enabled) {
    return (
      <section className="panel on">
        <p className="note">Sign in to manage travel trips and budgets.</p>
      </section>
    );
  }

  if (openingTrip) {
    return (
      <section className="panel on">
        <div className="card" style={{ textAlign: "center", padding: "28px 20px" }}>
          <p className="loading" style={{ padding: 0, margin: 0 }}>
            Opening trip...
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel on">
      <div className="section-head">
        <h2>This year trips</h2>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <label>
          Year
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || currentYear())}
            min={2000}
            max={2100}
            style={{ width: 100, marginLeft: 8 }}
          />
        </label>
      </div>

      <form className="card travel-create-form" onSubmit={(e) => void onCreate(e)} style={{ marginBottom: 12 }}>
        <div className="travel-create-grid">
          <label className="travel-field">
            <span>Trip name</span>
            <input
              type="text"
              placeholder="Trip name (e.g. Japan 2026)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="travel-field">
            <span>Country</span>
            <input
              type="text"
              placeholder="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </label>
          <label className="travel-field">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label className="travel-field">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <button type="submit" className="btn sm" disabled={saving || openingTrip}>
            {saving ? "Creating…" : "Create trip"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="note">Loading trips…</p>
      ) : (
        <div className="card table-scroll">
          <table>
            <thead>
              <tr>
                <th>Trip</th>
                <th>Country</th>
                <th>Date range</th>
                <th className="num">Budgeted</th>
                <th className="num">Spent</th>
                <th className="num">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="note">
                    No trips for {year} yet.
                  </td>
                </tr>
              ) : (
                items.map((trip) => (
                  <tr key={trip.id}>
                    <td>{trip.name}</td>
                    <td>{trip.country}</td>
                    <td>
                      {trip.startDate} to {trip.endDate}
                    </td>
                    <td className="num">{fmt2(trip.budgeted)}</td>
                    <td className="num">{fmt2(trip.spent)}</td>
                    <td className={`num ${trip.budgeted - trip.spent < 0 ? "neg" : ""}`}>
                      {fmt2(trip.budgeted - trip.spent)}
                    </td>
                    <td>
                      <Link href={`/travel/${trip.id}`} className="btn ghost sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td className="num">{fmt2(totals.budgeted)}</td>
                <td className="num">{fmt2(totals.spent)}</td>
                <td className={`num ${net < 0 ? "neg" : ""}`}>{fmt2(net)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {msg ? <p className="note">{msg}</p> : null}
    </section>
  );
}
