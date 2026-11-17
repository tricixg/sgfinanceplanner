export const MAX_QUOTE_SYMBOLS = 20;
export const MAX_QUOTE_SYMBOL_LENGTH = 24;

/** Normalize and cap symbol list from request body */
export function normalizeQuoteSymbols(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const list = Array.isArray(raw) ? raw : [];

  for (const item of list) {
    if (out.length >= MAX_QUOTE_SYMBOLS) break;
    const symbol = String(item).trim().toUpperCase();
    if (!symbol || symbol === "—" || symbol.length > MAX_QUOTE_SYMBOL_LENGTH) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    out.push(symbol);
  }

  return out;
}
