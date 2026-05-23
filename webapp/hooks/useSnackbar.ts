"use client";

import { useCallback, useState } from "react";

export function useSnackbar(defaultDurationMs = 2500) {
  const [message, setMessage] = useState("");
  const [variant, setVariant] = useState<"success" | "error">("success");
  const [durationMs, setDurationMs] = useState(defaultDurationMs);

  const dismiss = useCallback(() => setMessage(""), []);

  const show = useCallback(
    (msg: string, opts?: { error?: boolean; durationMs?: number }) => {
      setMessage(msg);
      setVariant(opts?.error ? "error" : "success");
      setDurationMs(opts?.durationMs ?? defaultDurationMs);
      console.info("[useSnackbar] show", { msg, error: opts?.error });
    },
    [defaultDurationMs]
  );

  return { message, variant, durationMs, show, dismiss };
}
