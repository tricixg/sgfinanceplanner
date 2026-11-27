"use client";

import { useState } from "react";
import { InlineConfirm } from "@/components/InlineConfirm";
import type { MilesAction } from "@/lib/miles/ledger";
import { expiryDateLabel, monthLabel, quarterLabel, type MonthIndex } from "@/lib/miles/months";
import { MILES_PROGRAMS, PROGRAM_ORDER, programColor } from "@/lib/miles/programs";
import { avail, type MilesLot } from "@/lib/miles/types";
import { errorMessage } from "@/lib/ui/notify";
import { fmt } from "@/components/miles/format";

type Props = {
  lots: MilesLot[];
  now: MonthIndex;
  mutate: (action: MilesAction) => Promise<void>;
  disabled?: boolean;
};

function firstColumn(lot: MilesLot): string {
  if (lot.program === "dbs_altitude") {
    if (!lot.loggedOn) return "Balance";
    const [y, m, d] = lot.loggedOn.split("-").map(Number);
    return `Added ${d} ${monthLabel(y * 12 + m - 1)}`;
  }
  if (lot.earnedMonth === null) return "Balance";
  return MILES_PROGRAMS[lot.program].quarterly ? quarterLabel(lot.earnedMonth) : monthLabel(lot.earnedMonth);
}

/** What's left of each lot, per programme. Lots logged by mistake can be deleted. */
export function MilesLedger({ lots, now, mutate, disabled }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await mutate({ action: "deleteLot", lotId: id });
      setConfirmId(null);
    } catch (e) {
      console.error("[MilesLedger] delete failed", e);
      setError(errorMessage(e, "Couldn't delete that line. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error ? (
        <p className="mt-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-ledger">
        {PROGRAM_ORDER.map((p) => {
          const rule = MILES_PROGRAMS[p];
          const rows = lots
            .filter((l) => l.program === p && avail(l) > 0 && (l.expiryMonth === null || l.expiryMonth >= now))
            .sort((a, b) => (a.expiryMonth ?? Infinity) - (b.expiryMonth ?? Infinity) || (a.earnedMonth ?? 0) - (b.earnedMonth ?? 0));
          const total = rows.reduce((s, l) => s + avail(l), 0);
          return (
            <div className="card mt-lcard" key={p}>
              <h3>
                <i className="dot" style={{ background: programColor(p) }} />
                {rule.name}
              </h3>
              <p className="note">{rule.rule}</p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{p === "dbs_altitude" ? "Added" : "Earned"}</th>
                      <th className="num">{rule.unit === "miles" ? "Miles" : "Points"}</th>
                      <th>Expires</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="note">
                          Nothing logged yet
                        </td>
                      </tr>
                    ) : (
                      rows.map((l) => (
                        <tr key={l.id}>
                          <td>
                            {firstColumn(l)}
                            {l.convertedFrom ? <span className="tag mt-from">from {MILES_PROGRAMS[l.convertedFrom].short}</span> : null}
                          </td>
                          <td className="num">
                            {fmt(avail(l))}
                            {l.used ? <span className="note"> of {fmt(l.amount)}</span> : null}
                          </td>
                          <td>{l.expiryMonth === null ? "No expiry" : expiryDateLabel(l.expiryMonth)}</td>
                          <td>
                            {l.used || l.source === "conversion" ? null : confirmId === l.id ? (
                              <InlineConfirm
                                prompt="Delete this line?"
                                confirmLabel="Delete"
                                busy={busy}
                                onConfirm={() => void remove(l.id)}
                                onCancel={() => setConfirmId(null)}
                              />
                            ) : (
                              <button
                                type="button"
                                className="btn ghost sm"
                                disabled={disabled}
                                aria-label={`Delete ${fmt(avail(l))} ${rule.unit} from ${firstColumn(l)}`}
                                onClick={() => setConfirmId(l.id)}
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total</td>
                      <td className="num">{fmt(total)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
