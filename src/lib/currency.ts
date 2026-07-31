export interface CurrencyOption {
  code: string;
  symbol: string;
  label: string;
  locale: string;
}

// Curated list — kept intentionally short so the switcher stays usable.
// EUR is the site's native/base currency (what customers are actually
// charged); everything else is a display-only conversion.
export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: "EUR", symbol: "€", label: "Euro", locale: "de-DE" },
  { code: "USD", symbol: "$", label: "US Dollar", locale: "en-US" },
  { code: "GBP", symbol: "£", label: "British Pound", locale: "en-GB" },
  { code: "CAD", symbol: "$", label: "Canadian Dollar", locale: "en-CA" },
  { code: "AUD", symbol: "$", label: "Australian Dollar", locale: "en-AU" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc", locale: "de-CH" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham", locale: "ar-AE" },
  { code: "SAR", symbol: "﷼", label: "Saudi Riyal", locale: "ar-SA" },
  { code: "INR", symbol: "₹", label: "Indian Rupee", locale: "en-IN" },
  { code: "PKR", symbol: "₨", label: "Pakistani Rupee", locale: "en-PK" },
  { code: "JPY", symbol: "¥", label: "Japanese Yen", locale: "ja-JP" },
];

const SUPPORTED_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

// ISO country code -> currency code, covering the countries we can
// confidently map to one of the currencies above. Anything not listed
// falls back to EUR (the site's home currency).
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  NZ: "AUD",
  CH: "CHF",
  LI: "CHF",
  AE: "AED",
  SA: "SAR",
  IN: "INR",
  PK: "PKR",
  JP: "JPY",
  // Eurozone + close neighbors default implicitly to EUR (no entry needed).
};

export function detectCurrencyFromCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return CURRENCY_BY_COUNTRY[country.toUpperCase()] ?? null;
}

/**
 * Client-only fallback for when Vercel's geo header isn't available (local
 * dev, non-Vercel hosting). Browser language is a weaker signal than IP
 * geolocation, but better than nothing.
 */
export function detectCurrencyFromLocale(): string | null {
  if (typeof navigator === "undefined") return null;

  const locale = navigator.language || (navigator.languages && navigator.languages[0]);
  if (!locale) return null;

  const region = locale.split("-")[1];
  return detectCurrencyFromCountry(region);
}

export function isSupportedCurrency(code: string | null | undefined): code is string {
  return Boolean(code) && SUPPORTED_CODES.has(code as string);
}

export function getCurrencyOption(code: string): CurrencyOption {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? SUPPORTED_CURRENCIES[0];
}

/**
 * Converts a EUR amount into the target currency using the supplied rate
 * map (EUR-base, as returned by getExchangeRates) and formats it with
 * Intl.NumberFormat for correct symbol placement/decimals per currency.
 */
export function convertAndFormat(
  amountEur: number,
  currency: string,
  rates: Record<string, number> | undefined,
): { formatted: string; converted: boolean } {
  if (currency === "EUR" || !rates) {
    return { formatted: formatMoney(amountEur, "EUR"), converted: false };
  }

  const rate = rates[currency];
  if (!rate) {
    return { formatted: formatMoney(amountEur, "EUR"), converted: false };
  }

  return { formatted: formatMoney(amountEur * rate, currency), converted: true };
}

export function formatMoney(amount: number, currency: string): string {
  const option = getCurrencyOption(currency);

  try {
    return new Intl.NumberFormat(option.locale, {
      style: "currency",
      currency: option.code,
      currencyDisplay: option.code === "JPY" ? "symbol" : "symbol",
      minimumFractionDigits: option.code === "JPY" ? 0 : 2,
      maximumFractionDigits: option.code === "JPY" ? 0 : 2,
    }).format(amount);
  } catch {
    return `${option.symbol}${amount.toFixed(2)}`;
  }
}
