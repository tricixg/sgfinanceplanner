/**
 * Browser-side idempotency keys for create requests (DATA-003). The server
 * stores the key with the row; the same key again returns the original row
 * instead of creating a second one (double-click, retry after a timeout).
 */

export function newClientRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Key for one leg of a multi-request action (e.g. the account side of a
 * transfer), so retrying the whole action replays legs that already went
 * through instead of repeating them.
 */
export function deriveClientRequestId(key: string | undefined, leg: string): string | undefined {
  return key ? `${key}:${leg}` : undefined;
}

/**
 * Remembers one key per submitted payload: submitting the same payload again
 * (double-click, retry after an error or timeout) reuses the key; a changed
 * payload gets a new one. Call reset() after a success so the next, possibly
 * identical, entry (two $5 coffees) is a new request.
 */
export class SubmitKey {
  private last: { fingerprint: string; key: string } | null = null;

  keyFor(payload: unknown): string {
    const fingerprint = JSON.stringify(payload ?? null);
    if (!this.last || this.last.fingerprint !== fingerprint) {
      this.last = { fingerprint, key: newClientRequestId() };
    }
    return this.last.key;
  }

  reset(): void {
    this.last = null;
  }
}
