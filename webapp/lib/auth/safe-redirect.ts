/**
 * Validates post-login redirect targets to prevent open redirects.
 * Only same-origin relative paths are allowed (no protocol-relative URLs).
 */
export function safeRelativeRedirectPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  const trimmed = next.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  if (trimmed.includes("\\")) return "/";
  if (/[\s\r\n]/.test(trimmed)) return "/";
  return trimmed;
}
