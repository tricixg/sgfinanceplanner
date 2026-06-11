export const BASE_REPORTING_CURRENCY = "SGD";

export type PokerCurrencyOption = {
  code: string;
  label: string;
};

/** Currencies supported for poker sessions (aligned with Frankfurter coverage). */
export const POKER_CURRENCIES: PokerCurrencyOption[] = [
  { code: "SGD", label: "Singapore Dollar" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "HKD", label: "Hong Kong Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "KRW", label: "South Korean Won" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "THB", label: "Thai Baht" },
  { code: "PHP", label: "Philippine Peso" },
  { code: "IDR", label: "Indonesian Rupiah" },
  { code: "INR", label: "Indian Rupee" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "TWD", label: "Taiwan Dollar" },
  { code: "VND", label: "Vietnamese Dong" },
];

const SUPPORTED = new Set(POKER_CURRENCIES.map((c) => c.code));

export function normalizeCurrencyCode(code: string | undefined | null): string {
  return String(code ?? BASE_REPORTING_CURRENCY)
    .trim()
    .toUpperCase();
}

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED.has(normalizeCurrencyCode(code));
}

export function currencyLabel(code: string): string {
  const norm = normalizeCurrencyCode(code);
  const match = POKER_CURRENCIES.find((c) => c.code === norm);
  return match ? `${match.code} — ${match.label}` : norm;
}
