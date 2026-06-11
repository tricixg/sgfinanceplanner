"use client";

import { useEffect } from "react";
import { fmt2 } from "@/lib/finance/helpers";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatSessionAmountWithSgd,
  formatSessionPlCell,
} from "@/lib/poker/format-session-amount";
import { sessionMetrics } from "@/lib/poker/stats";
import type { PokerSession } from "@/lib/poker/types";
import { formatGameStakes, pokerTournamentCost, pokerTournamentReturn } from "@/lib/poker/types";
import {
  formatHourly,
  formatPct,
  formatSessionDate,
  plClass,
} from "@/components/poker/stats/format";

type Props = {
  session: PokerSession;
  onClose: () => void;
  onEdit: () => void;
};

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="poker-session-detail-row">
      <span className="poker-session-detail-label">{label}</span>
      <span className="poker-session-detail-value">{children}</span>
    </div>
  );
}

function formatTournamentResult(session: PokerSession): string {
  if (session.tournamentResult === "busted") return "Busted";
  if (session.tournamentResult === "placed") {
    if (session.tournamentPlace != null) {
      const of =
        session.tournamentEntries != null ? ` of ${session.tournamentEntries}` : "";
      return `Placed ${session.tournamentPlace}${of}`;
    }
    return "Placed";
  }
  return "—";
}

export function PokerSessionDetailModal({ session, onClose, onEdit }: Props) {
  const pl = pokerProfitSgd(session);
  const metrics = sessionMetrics([session]);
  const isTournament = session.sessionType === "tournament";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    console.info("[PokerSessionDetailModal] opened", { id: session.id });
  }, [session.id]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card modal-panel poker-session-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poker-detail-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="poker-detail-title" className="poker-session-detail-title">
              {isTournament ? "Tournament" : "Cash game"} session
            </h3>
            <p className="note poker-session-detail-subtitle">
              {formatSessionDate(session.playedAt)}
              {session.location ? ` · ${session.location}` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="poker-session-detail-stats">
          <div className="poker-session-detail-stat poker-session-detail-stat--accent">
            <span className="poker-session-detail-stat-label">P/L</span>
            <span className={`poker-session-detail-stat-value ${plClass(pl)}`}>
              {formatSessionPlCell(session)}
            </span>
          </div>
          <div className="poker-session-detail-stat">
            <span className="poker-session-detail-stat-label">Hourly</span>
            <span
              className={`poker-session-detail-stat-value ${plClass(metrics.hourly ?? 0)}`}
            >
              {formatHourly(metrics.hourly)}
            </span>
          </div>
          <div className="poker-session-detail-stat">
            <span className="poker-session-detail-stat-label">ROI</span>
            <span className="poker-session-detail-stat-value">
              {formatPct(metrics.roi)}
            </span>
          </div>
        </div>

        <div className="poker-session-detail-section">
          <div className="poker-session-detail-section-title">Game</div>
          {isTournament ? (
            <>
              <DetailRow label="Tournament">{session.tournamentName?.trim() || "—"}</DetailRow>
              {session.eventName?.trim() &&
              session.eventName.trim() !== session.tournamentName?.trim() ? (
                <DetailRow label="Event">{session.eventName}</DetailRow>
              ) : null}
              {session.game ? (
                <DetailRow label="Game">{formatGameStakes(session.game)}</DetailRow>
              ) : null}
              <DetailRow label="Result">{formatTournamentResult(session)}</DetailRow>
              {session.tournamentResult === "placed" && session.amountWon != null ? (
                <DetailRow label="Prize won">
                  {formatSessionAmountWithSgd(session.amountWon, session)}
                </DetailRow>
              ) : null}
              {session.bountyAmount > 0 ? (
                <DetailRow label="Bounties">
                  {formatSessionAmountWithSgd(session.bountyAmount, session)}
                </DetailRow>
              ) : null}
              {session.rebuyAmount > 0 || session.bountyAmount > 0 ? (
                <DetailRow label="Total cashed">
                  {formatSessionAmountWithSgd(pokerTournamentReturn(session), session)}
                </DetailRow>
              ) : null}
            </>
          ) : session.game ? (
            <>
              <DetailRow label="Game">{session.game.name}</DetailRow>
              <DetailRow label="Blinds">
                {session.game.smallBlind}/{session.game.bigBlind}
                {session.game.ante != null && session.game.ante > 0
                  ? ` · ante ${session.game.ante}`
                  : ""}
              </DetailRow>
              <DetailRow label="Stakes">{formatGameStakes(session.game)}</DetailRow>
            </>
          ) : (
            <DetailRow label="Game">—</DetailRow>
          )}
        </div>

        <div className="poker-session-detail-section">
          <div className="poker-session-detail-section-title">Session</div>
          <DetailRow label={isTournament ? "Initial buy-in" : "Buy-in"}>
            {formatSessionAmountWithSgd(session.buyIn, session)}
          </DetailRow>
          {isTournament && session.rebuyAmount > 0 ? (
            <DetailRow label="Rebuy">
              {formatSessionAmountWithSgd(session.rebuyAmount, session)}
            </DetailRow>
          ) : null}
          {isTournament && session.rebuyAmount > 0 ? (
            <DetailRow label="Total invested">
              {formatSessionAmountWithSgd(pokerTournamentCost(session), session)}
            </DetailRow>
          ) : null}
          {!isTournament ? (
            <DetailRow label="Cash-out">
              {formatSessionAmountWithSgd(session.cashOut, session)}
            </DetailRow>
          ) : null}
          <DetailRow label="Hours">
            {session.hours != null && session.hours > 0 ? `${fmt2(session.hours)}h` : "—"}
          </DetailRow>
          {session.note?.trim() ? (
            <DetailRow label="Note">{session.note}</DetailRow>
          ) : null}
        </div>

        <div className="toolbar poker-session-detail-actions">
          <button type="button" className="btn" onClick={onEdit}>
            Edit session
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
