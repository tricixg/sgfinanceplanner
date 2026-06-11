"use client";

import { useEffect, useState } from "react";
import { PokerSessionForm } from "@/components/poker/PokerSessionForm";
import { useFinancialAccounts } from "@/hooks/useFinancialAccounts";
import { usePokerSessionForm } from "@/hooks/usePokerSessionForm";
import { fetchJson } from "@/lib/fetch-json";
import { dispatchDomainEvent } from "@/lib/events/domain-events";
import type { PokerGame, PokerSession } from "@/lib/poker/types";

type Props = {
  session: PokerSession;
  onClose: () => void;
  onSaved: (session: PokerSession) => void;
};

export function PokerSessionEditModal({ session, onClose, onSaved }: Props) {
  const [locations, setLocations] = useState<string[]>([]);
  const [games, setGames] = useState<PokerGame[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const { accounts: financialAccounts } = useFinancialAccounts();
  const cashAccounts = financialAccounts.filter((a) => a.savingsAccountId);

  const form = usePokerSessionForm({
    enabled: true,
    locations,
    games,
    setLocations,
    setGames,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingMeta(true);
      try {
        const [locRes, gameRes] = await Promise.all([
          fetchJson<{ items?: { id: string; name: string }[] }>("/api/poker/locations", {
            credentials: "include",
          }),
          fetchJson<{ items?: PokerGame[] }>("/api/poker/games", { credentials: "include" }),
        ]);
        if (cancelled) return;
        if (locRes.data.items) {
          setLocations(locRes.data.items.map((l) => l.name).filter(Boolean));
        }
        if (gameRes.data.items) setGames(gameRes.data.items);
        form.populateFromSession(session);
        console.info("[PokerSessionEditModal] opened", { id: session.id });
      } catch (e) {
        console.error("[PokerSessionEditModal] load meta failed", e);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per session id
  }, [session.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !form.submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, form.submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await form.saveSession();
    if (!saved) return;
    if (saved.financialAccountId && saved.savingsTransactionId) {
      dispatchDomainEvent("savings:changed");
    }
    onSaved(saved);
    onClose();
    console.info("[PokerSessionEditModal] saved", { id: saved.id });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !form.submitting) onClose();
      }}
    >
      <div
        className="card modal-panel poker-session-edit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poker-edit-title"
      >
        <div className="modal-header">
          <div>
            <h3 id="poker-edit-title" style={{ margin: 0 }}>
              Edit session
            </h3>
            <p className="note" style={{ margin: "4px 0 0" }}>
              Changes resync the linked cash account entry when P/L changes and an account is
              selected.
            </p>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            disabled={form.submitting}
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        {loadingMeta ? (
          <p className="loading">Loading…</p>
        ) : (
          <PokerSessionForm
            form={form}
            cashAccounts={cashAccounts}
            onSubmit={(e) => void handleSubmit(e)}
            onCancel={onClose}
            className="poker-session-form"
          />
        )}
      </div>
    </div>
  );
}
