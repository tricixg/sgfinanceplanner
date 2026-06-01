"use client";

type Props = {
  prompt: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Inline confirm/cancel for destructive actions (replaces window.confirm). */
export function InlineConfirm({
  prompt,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="inline-confirm" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="note" style={{ color: danger ? "var(--rust)" : undefined }}>
        {prompt}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className={danger ? "btn del sm" : "btn sm"}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
