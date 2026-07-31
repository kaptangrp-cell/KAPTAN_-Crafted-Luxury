import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

type RatesResponse = {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetchedAt: number;
  stale?: boolean;
};

// A frozen snapshot used only if the live rate source is unreachable, so the
// site never breaks — but every response is flagged `stale` so nothing
// pretends this is live data.
const FALLBACK_RATES: Record<string, number> = {
  USD: 1.08,
  GBP: 0.86,
  CAD: 1.47,
  AUD: 1.63,
  CHF: 0.94,
  JPY: 163,
  AED: 3.97,
  SAR: 4.05,
  INR: 90,
  PKR: 301,
};

let cache: RatesResponse | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Live EUR-base exchange rates from the European Central Bank (via
 * frankfurter.app — free, no API key, updated on ECB business days).
 * Cached in-memory per server instance for 6h so we don't hit the upstream
 * API on every page load. Falls back to a static snapshot (clearly flagged
 * `stale: true`) if the upstream call fails, so currency display degrades
 * gracefully instead of crashing.
 */
export const getExchangeRates = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache;
  }

  try {
    const res = await fetch(
      "https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,CAD,AUD,CHF,JPY,AED,SAR,INR,PKR",
    );

    if (!res.ok) throw new Error(`Rate provider responded ${res.status}`);

    const data = (await res.json()) as { base: string; date: string; rates: Record<string, number> };

    cache = {
      base: "EUR",
      date: data.date,
      rates: data.rates,
      fetchedAt: Date.now(),
    };

    return cache;
  } catch (err) {
    console.error("[currency] Failed to fetch live exchange rates, using fallback:", err);

    return {
      base: "EUR",
      date: "fallback",
      rates: FALLBACK_RATES,
      fetchedAt: Date.now(),
      stale: true,
    } satisfies RatesResponse;
  }
});

/**
 * Reads Vercel's automatic edge geolocation header to guess the visitor's
 * country — no external geo-IP call needed. Returns null outside Vercel
 * (e.g. local dev), letting the client fall back to browser locale.
 */
export const detectVisitorCountry = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const country = request?.headers.get("x-vercel-ip-country") ?? null;
  return { country };
});
