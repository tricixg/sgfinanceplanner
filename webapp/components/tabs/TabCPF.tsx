"use client";

import { useContext, useState } from "react";
import type { DashboardState } from "@/lib/types";
import { simulateCPF } from "@/lib/finance";
import { fmt } from "@/lib/finance/helpers";
import { ChartBox } from "@/components/ChartBox";
import { DecimalInput } from "@/components/DecimalInput";
import { AppDataContext } from "@/contexts/app-data-contexts";

type Props = {
  state: DashboardState;
  setState: (s: DashboardState | ((p: DashboardState) => DashboardState)) => void;
};

export function TabCPF({ state: S, setState }: Props) {
  const appData = useContext(AppDataContext);
  const [growth, setGrowth] = useState(3.5);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cpfDraft, setCpfDraft] = useState({ oa: S.oa, sa: S.sa, ma: S.ma });
  const series = simulateCPF(S, growth);
  const cpfNow = S.oa + S.sa + S.ma;

  const startEdit = () => {
    setCpfDraft({ oa: S.oa, sa: S.sa, ma: S.ma });
    setEditing(true);
    console.info("[TabCPF] edit mode on");
  };

  const saveCpf = async () => {
    setSaving(true);
    try {
      if (appData?.configured) {
        await appData.saveProfile(cpfDraft);
      } else {
        setState((prev) => ({ ...prev, ...cpfDraft }));
      }
      setEditing(false);
      console.info("[TabCPF] CPF balances saved", cpfDraft);
    } catch (e) {
      console.error("[TabCPF] CPF save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const patchCpfDraft = (key: "oa" | "sa" | "ma", val: number) => {
    setCpfDraft((d) => ({ ...d, [key]: val }));
    console.info("[TabCPF] draft CPF balance", key, val);
  };

  const chartData = {
    labels: series.map((r) => r.label),
    datasets: [
      {
        label: "OA",
        data: series.map((r) => r.oa),
        borderColor: "#2f5d3a",
        backgroundColor: "rgba(47,93,58,.12)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: "SA",
        data: series.map((r) => r.sa),
        borderColor: "#3d6b8e",
        backgroundColor: "rgba(61,107,142,.10)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
      {
        label: "MA",
        data: series.map((r) => r.ma),
        borderColor: "#c08a2e",
        backgroundColor: "rgba(192,138,46,.10)",
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  return (
    <section className="panel on">
      <div className="callout tip">
        <span className="ico">Tip</span>
        Update your current OA, SA, and MediSave balances below — they feed BTO planning, net
        worth (when CPF is included), and the 5-year projection. Changes auto-save when Supabase
        is configured.
      </div>

      <div className="ctrl">
        <label>
          Salary growth / yr (projection)
          <DecimalInput value={growth} onChange={setGrowth} />
          %
        </label>
      </div>

      <div className="section-head">
        <h2>CPF balances · now</h2>
        {editing ? (
          <button
            type="button"
            className="btn sm"
            disabled={saving}
            onClick={() => void saveCpf()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button type="button" className="btn ghost sm" onClick={startEdit}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="card">
          <div className="editrow head">
            <span>Account</span>
            <span>Balance</span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          {(
            [
              ["Ordinary Account (OA)", "oa"],
              ["Special Account (SA)", "sa"],
              ["MediSave (MA)", "ma"],
            ] as const
          ).map(([label, key]) => (
            <div className="editrow" key={key}>
              <span>{label}</span>
              <DecimalInput
                value={cpfDraft[key]}
                onChange={(v) => patchCpfDraft(key, v)}
              />
              <span></span>
              <span></span>
              <span></span>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid g4">
          <div className="stat">
            <div className="lbl">Ordinary Account · now</div>
            <div className="val">{fmt(S.oa)}</div>
          </div>
          <div className="stat">
            <div className="lbl">Special Account · now</div>
            <div className="val">{fmt(S.sa)}</div>
          </div>
          <div className="stat">
            <div className="lbl">MediSave · now</div>
            <div className="val">{fmt(S.ma)}</div>
          </div>
          <div className="stat accent">
            <div className="lbl">Total CPF · now</div>
            <div className="val">{fmt(cpfNow)}</div>
            <div className="note">Click Edit to update balances</div>
          </div>
        </div>
      )}

      <h2>CPF account growth · 5 years</h2>
      <div className="card">
        <ChartBox
          type="line"
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { display: false } },
              y: {
                grid: { color: "#e6dfca" },
                ticks: {
                  callback: (v) => "$" + (Number(v) / 1000).toFixed(0) + "k",
                },
              },
            },
          }}
          tall
        />
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Year-end</th>
              <th>OA</th>
              <th>SA</th>
              <th>MA</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {series.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td className="num">{fmt(r.oa)}</td>
                <td className="num">{fmt(r.sa)}</td>
                <td className="num">{fmt(r.ma)}</td>
                <td className="num pos">
                  <b>{fmt(r.oa + r.sa + r.ma)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
