/** Client-only: force PIN screen after "Lock app" even if cookie clear is delayed. */
export const PIN_FORCE_LOCK_KEY = "sgfp_force_lock";

export function requestAppLock() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(PIN_FORCE_LOCK_KEY, "1");
  console.info("[pin-client] force lock requested");
}

export function consumeForceLock(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (sessionStorage.getItem(PIN_FORCE_LOCK_KEY) !== "1") return false;
  sessionStorage.removeItem(PIN_FORCE_LOCK_KEY);
  console.info("[pin-client] force lock consumed");
  return true;
}
