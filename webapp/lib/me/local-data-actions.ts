/**
 * "Reset all to zero", "Add dummy data" and "Import JSON" only replace the
 * in-memory dashboard state; nothing is persisted. For a signed-in user that
 * state mirrors the server, and the whole-list saves on other pages could then
 * write the replaced (wrong) lists back. They are therefore only offered in
 * browser-only mode (no signed-in user).
 */
export function canReplaceLocalState(signedIn: boolean): boolean {
  return !signedIn;
}
