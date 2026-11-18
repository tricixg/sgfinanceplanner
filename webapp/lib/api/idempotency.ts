/**
 * Optional idempotency key sent by forms with create requests (DATA-003).
 * The database stores it in a `client_request_id` column that is unique per
 * user, so a retried or double-submitted request returns the original row
 * instead of creating a second one.
 */
export const INVALID_CLIENT_REQUEST_ID = "Invalid clientRequestId";

const KEY_RE = /^[A-Za-z0-9._:-]{8,100}$/;

/** `null` when absent; `{ error }` when present but malformed. */
export function parseClientRequestId(value: unknown): string | null | { error: string } {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !KEY_RE.test(value)) {
    return { error: INVALID_CLIENT_REQUEST_ID };
  }
  return value;
}
