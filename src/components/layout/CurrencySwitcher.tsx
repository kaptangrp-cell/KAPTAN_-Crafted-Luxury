import { useState } from "react";
import { Coins } from "lucide-react";
import { useCurrencyStore } from "@/stores/currencyStore";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

/**
 * Small dropdown letting shoppers override the auto-detected display
 * currency. Purely cosmetic — checkout always charges in EUR regardless
 * of what's selected here (see the disclaimer on the checkout page).
 */
export function CurrencySwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const currency = useCurrencyStore((s) => s.effectiveCurrency());
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 p-1 text-xs font-semibold uppercase text-gold/80 transition-colors hover:text-gold"
        aria-label="Change display currency"
        title="Change display currency"
      >
        <Coins size={16} />
        <span>{currency}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-40 border border-gold/20 bg-[#0D0D0D] py-1 shadow-lg">
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => {
                setCurrency(c.code);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors hover:bg-gold/10 hover:text-gold ${
                currency === c.code ? "text-gold" : "text-white/70"
              }`}
            >
              <span>{c.code}</span>
              <span className="text-white/40">{c.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
