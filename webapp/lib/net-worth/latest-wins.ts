/**
 * Serialises writes so the LAST call always determines the final stored value.
 *
 * Firing overlapping POSTs lets them land out of order (an older request can
 * finish after a newer one and overwrite it). Here at most one request is in
 * flight; calls made meanwhile are coalesced into a single pending write that
 * carries only the newest value, sent after the in-flight request settles.
 * Every caller's promise resolves with the value that was actually persisted
 * (so a superseded caller observes the newer value), or rejects if that
 * request failed. A failure never blocks later writes.
 */
export function createLatestWinsWriter<T>(send: (value: T) => Promise<void>) {
  type Waiter = { resolve: (persisted: T) => void; reject: (e: unknown) => void };
  let inFlight = false;
  let pending: { value: T; waiters: Waiter[] } | null = null;

  async function pump(): Promise<void> {
    if (inFlight) return;
    inFlight = true;
    try {
      while (pending) {
        const batch = pending;
        pending = null;
        try {
          await send(batch.value);
          batch.waiters.forEach((w) => w.resolve(batch.value));
        } catch (e) {
          batch.waiters.forEach((w) => w.reject(e));
        }
      }
    } finally {
      inFlight = false;
    }
  }

  return {
    write(value: T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (pending) {
          pending.value = value;
          pending.waiters.push({ resolve, reject });
        } else {
          pending = { value, waiters: [{ resolve, reject }] };
        }
        void pump();
      });
    },
  };
}
