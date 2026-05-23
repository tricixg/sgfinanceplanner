"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  variant?: "success" | "error";
  durationMs?: number;
  onDismiss: () => void;
};

export function Snackbar({
  message,
  variant = "success",
  durationMs = 2500,
  onDismiss,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      onDismiss();
      console.info("[Snackbar] dismissed", { message });
    }, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div
      className={`snackbar snackbar--${variant}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
