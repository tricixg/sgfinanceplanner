/**
 * App-wide notices, shown by <NotifyHost /> with the same Snackbar the tabs already use.
 * `notifyError` is how a failed save tells the user, from anywhere (a hook, a modal, a callback)
 * without that code owning any markup. Messages are for people; the real error still goes to
 * the console at the call site.
 */
export type Notice = { message: string; error: boolean };

export const NOTIFY_EVENT = "app:notify";

function emit(notice: Notice): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Notice>(NOTIFY_EVENT, { detail: notice }));
}

export function notifyError(message: string): void {
  emit({ message, error: true });
}

export function notifySuccess(message: string): void {
  emit({ message, error: false });
}

/** The text to show for a caught value: its own message when it is an Error, else `fallback`. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  return fallback;
}

/** Report a failed save: names what failed, then why, e.g. "Couldn't save CPF balances. <reason>". */
export function notifySaveFailed(what: string, e: unknown): void {
  const reason = errorMessage(e, "");
  notifyError(reason ? `Couldn't save ${what}. ${reason}` : `Couldn't save ${what}. Please try again.`);
}
