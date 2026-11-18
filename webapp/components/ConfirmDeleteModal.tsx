"use client";

import { useEffect } from "react";

type Props = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Red destructive styling (default). Pass false for neutral confirmations. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Popup modal asking the user to confirm a destructive delete. */
export function ConfirmDeleteModal({
  title = "Delete transaction?",
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="card modal-panel" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <h3 id="confirm-delete-title" style={{ margin: 0 }}>
            {title}
          </h3>
        </div>
        <p className="note" style={{ marginBottom: 16 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? "btn del sm" : "btn sm"}
            disabled={busy}
            onClick={onConfirm}
            autoFocus
          >
            {busy ? (danger ? "Deleting…" : "Working…") : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
