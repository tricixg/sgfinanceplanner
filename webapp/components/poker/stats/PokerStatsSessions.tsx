"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { PokerSessionDetailModal } from "@/components/poker/PokerSessionDetailModal";
import { PokerSessionEditModal } from "@/components/poker/PokerSessionEditModal";
import { PokerImportMenu } from "@/components/poker/PokerImportMenu";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import type { PokerSession } from "@/lib/poker/types";
import { sessionGameLabel } from "@/lib/poker/types";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatSessionAmountWithSgd,
  formatSessionPlCell,
} from "@/lib/poker/format-session-amount";
import {
  formatSessionDate,
  plClass,
} from "@/components/poker/stats/format";

type ImportResult = {
  imported: number;
  warnings: { row: number; message: string }[];
  ledgerSynced?: boolean;
};

type Props = {
  sessions: PokerSession[];
  onSessionUpdated: (session: PokerSession) => void;
  onSessionDeleted: (id: string) => void;
  onImported: (result: ImportResult) => void;
};

export function PokerStatsSessions({
  sessions,
  onSessionUpdated,
  onSessionDeleted,
  onImported,
}: Props) {
  const [viewingSession, setViewingSession] = useState<PokerSession | null>(null);
  const [editingSession, setEditingSession] = useState<PokerSession | null>(null);
  const removeSession = async (session: PokerSession) => {
    if (!confirm("Delete this poker session?")) return;
    try {
      const { res, data } = await fetchJson<{ error?: string }>(`/api/poker/${session.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
      setViewingSession(null);
      setEditingSession(null);
      onSessionDeleted(session.id);
      dispatchDomainEvent("savings:changed");
      console.info("[PokerStatsSessions] deleted session", { id: session.id });
    } catch (e) {
      console.error("[PokerStatsSessions] delete failed", e);
      alert(e instanceof Error ? e.message : "Failed to delete session");
    }
  };

  const byYear = new Map<string, PokerSession[]>();
  for (const s of sessions) {
    const y = s.playedAt.slice(0, 4);
    const list = byYear.get(y) ?? [];
    list.push(s);
    byYear.set(y, list);
  }

  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <>
      <div
        className="toolbar"
        style={{ marginBottom: 16, width: "100%", justifyContent: "flex-end" }}
      >
        <PokerImportMenu onImported={onImported} />
      </div>

      {sessions.length === 0 ? (
        <p className="note">No sessions logged yet.</p>
      ) : (
        <div className="poker-session-list">
          {years.map((year) => (
            <div key={year} style={{ marginBottom: 20 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                {year}
              </div>
              {byYear.get(year)!.map((s) => {
                const pl = pokerProfitSgd(s);
                const gameLabel =
                  s.sessionType === "tournament"
                    ? s.tournamentName
                      ? `${s.tournamentName} · ${sessionGameLabel(s)}`
                      : sessionGameLabel(s)
                    : sessionGameLabel(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="card poker-session-card poker-session-card--clickable"
                    aria-label={`View ${s.sessionType === "tournament" ? "tournament" : "cash"} session`}
                    onClick={() => setViewingSession(s)}
                  >
                    <div className="poker-session-card-top">
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {s.sessionType === "tournament" ? "Tournament" : "Cash"} · {gameLabel}
                        </div>
                        <div className="note">{s.location || "—"}</div>
                      </div>
                      <div className={`poker-session-pl ${plClass(pl)}`}>
                        {formatSessionPlCell(s)}
                      </div>
                    </div>
                    <div className="poker-session-card-bottom note">
                      <span>Buy-in {formatSessionAmountWithSgd(s.buyIn, s)}</span>
                      <span>{formatSessionDate(s.playedAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {viewingSession && !editingSession ? (
        <PokerSessionDetailModal
          session={viewingSession}
          onClose={() => setViewingSession(null)}
          onEdit={() => {
            setEditingSession(viewingSession);
            setViewingSession(null);
            console.info("[PokerStatsSessions] edit from detail", { id: viewingSession.id });
          }}
          onDelete={() => void removeSession(viewingSession)}
        />
      ) : null}

      {editingSession ? (
        <PokerSessionEditModal
          session={editingSession}
          onClose={() => setEditingSession(null)}
          onSaved={(updated) => {
            onSessionUpdated(updated);
            setEditingSession(null);
          }}
        />
      ) : null}
    </>
  );
}
