import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getExchangeRates } from "@/lib/currency.functions";
import { useCurrencyStore } from "@/stores/currencyStore";
import { convertAndFormat, formatMoney } from "@/lib/currency";

export const exchangeRatesQueryOptions = queryOptions({
  queryKey: ["exchange-rates"],
  queryFn: () => getExchangeRates(),
  staleTime: 60 * 60 * 1000, // 1h client-side; server itself caches for 6h
  gcTime: 24 * 60 * 60 * 1000,
});

/**
 * Fetches live rates via the exchange-rates query. Call this once high up
 * (e.g. root layout) to warm the cache — every other component just reads
 * from the same React Query cache entry, no duplicate fetches.
 */
export function useExchangeRates() {
  const fetchRates = useServerFn(getExchangeRates);
  return useQuery({ ...exchangeRatesQueryOptions, queryFn: () => fetchRates() });
}

/**
 * Converts a EUR amount into the shopper's effective display currency
 * (their explicit choice, or the auto-detected one, or EUR). Falls back to
 * plain EUR formatting whenever rates aren't loaded yet or the currency
 * isn't in the rate map, so prices never show blank or wrong.
 */
export function useDisplayPrice(amountEur: number): {
  formatted: string;
  currency: string;
  isConverted: boolean;
} {
  const currency = useCurrencyStore((s) => s.effectiveCurrency());
  const { data } = useExchangeRates();

  if (currency === "EUR") {
    return { formatted: formatMoney(amountEur, "EUR"), currency: "EUR", isConverted: false };
  }

  const { formatted, converted } = convertAndFormat(amountEur, currency, data?.rates);
  return { formatted, currency: converted ? currency : "EUR", isConverted: converted };
}
