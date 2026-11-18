"use client";

import { useRef } from "react";
import { SubmitKey } from "@/lib/api/client-request-id";

/**
 * One idempotency key per form submission: `keyFor(payload)` returns the same
 * key for a repeated submit of the same values, `reset()` after a success.
 * See SubmitKey in lib/api/client-request-id.ts.
 */
export function useSubmitKey(): SubmitKey {
  const ref = useRef<SubmitKey | null>(null);
  if (ref.current === null) ref.current = new SubmitKey();
  return ref.current;
}
