"use client";

import type { PokerSession } from "@/lib/poker/types";
import { sessionGameLabel } from "@/lib/poker/types";
import { pokerProfitSgd } from "@/lib/fx/convert";
import {
  formatSessionAmountWithSgd,
  formatSessionPlCell,
} from "@/lib/poker/format-session-amount";
import { formatPokerPlayedAtDisplay } from "@/lib/poker/played-at";
import { plClass } from "@/components/poker/stats/format";

type Props = {
  session: PokerSession;
  outLabel: string;
  resultLabel: string;
  onEdit: () => void;
  onDelete: () => void;
};

export function PokerSessionMobileCard({
  session,
  outLabel,
  resultLabel,
  onEdit,
  onDelete,
}: Props) {
  const pl = pokerProfitSgd(session);
  const gameLabel =
    session.sessionType === "tournament" && session.tournamentName
      ? `${session.tournamentName} · ${sessionGameLabel(session)}`
      : sessionGameLabel(session);

  return (
    <div className="card poker-session-card poker-recent-card">
      <div className="poker-session-card-top">
        <div className="poker-recent-card-main">
          <div style={{ fontWeight: 600 }}>
            {session.sessionType === "tournament" ? "Tournament" : "Cash"} · {gameLabel}
          </div>
          <div className="note">{session.location || "—"}</div>
          <div className="note">{formatPokerPlayedAtDisplay(session.playedAt)}</div>
        </div>
        <div className={`poker-session-pl ${plClass(pl)}`}>{formatSessionPlCell(session)}</div>
      </div>
      <dl className="poker-recent-card-meta note">
        <div>
          <dt>Buy-in</dt>
          <dd>{formatSessionAmountWithSgd(session.buyIn, session)}</dd>
        </div>
        <div>
          <dt>Out / won</dt>
          <dd>{outLabel}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>{resultLabel}</dd>
        </div>
        <div>
          <dt>Hours</dt>
          <dd>{session.hours != null ? session.hours : "—"}</dd>
        </div>
      </dl>
      {session.note ? <p className="note poker-recent-card-note">{session.note}</p> : null}
      <div className="poker-recent-card-actions">
        <button type="button" className="btn ghost sm" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="btn ghost sm" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
