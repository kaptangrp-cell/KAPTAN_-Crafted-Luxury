import { useDisplayPrice } from "@/hooks/useCurrency";

/**
 * Renders a EUR amount converted into the shopper's display currency.
 * Pulled out as its own component (rather than calling useDisplayPrice
 * inline) so it's safe to use inside .map() loops without violating the
 * rules of hooks — each <Price/> instance owns its own hook call.
 */
export function Price({ amount, className }: { amount: number; className?: string }) {
  const { formatted } = useDisplayPrice(amount);
  return <span className={className}>{formatted}</span>;
}
