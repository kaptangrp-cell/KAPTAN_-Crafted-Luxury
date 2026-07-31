import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isSupportedCurrency } from "@/lib/currency";

interface CurrencyState {
  /** Explicitly chosen by the shopper via the switcher — persisted, always wins. */
  userCurrency: string | null;
  /** Auto-detected for this session (geo header or browser locale) — not persisted. */
  detectedCurrency: string | null;
  hasHydrated: boolean;
  setCurrency: (code: string) => void;
  setDetectedCurrency: (code: string | null) => void;
  effectiveCurrency: () => string;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      userCurrency: null,
      detectedCurrency: null,
      hasHydrated: false,
      setCurrency: (code) => {
        if (!isSupportedCurrency(code)) return;
        set({ userCurrency: code });
      },
      setDetectedCurrency: (code) => {
        if (code && !isSupportedCurrency(code)) return;
        set({ detectedCurrency: code });
      },
      effectiveCurrency: () => get().userCurrency ?? get().detectedCurrency ?? "EUR",
    }),
    {
      name: "kaptan-currency",
      // Only persist the explicit user choice — detection re-runs each
      // session so travelers see their current region, not a stale one.
      partialize: (state) => ({ userCurrency: state.userCurrency }),
      skipHydration: true,
    },
  ),
);
