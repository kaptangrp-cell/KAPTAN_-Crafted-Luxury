// Corrected merchant declaration: Kleinunternehmer under §19 UStG.
// A future regular-VAT rollout must update the database policy and application together.
// Never use current policy to recalculate historical order or invoice snapshots.
export type TaxMode = "kleinunternehmer" | "regular";
export const CURRENT_TAX_MODE: TaxMode = "kleinunternehmer";
export const VAT_RATE = 0;
export const VAT_FACTOR = 1;
export const EXEMPTION_NOTICE =
  "Steuerbefreiung für Kleinunternehmer gemäß § 19 UStG. Es wird keine Umsatzsteuer berechnet.";
export const SHIPPING_GROSS = 5.99;
export const grossPrice = (net: number) =>
  Math.round(Number(net) * 100 * VAT_FACTOR + Number.EPSILON) / 100;
export function consumerProduct<
  T extends {
    price: number;
    compare_at_price?: number | null;
    product_variants?: { price_modifier?: number | null }[];
  },
>(product: T): T {
  const base = grossPrice(product.price);
  return {
    ...product,
    price: base,
    ...(product.compare_at_price == null
      ? {}
      : { compare_at_price: grossPrice(product.compare_at_price) }),
    ...(product.product_variants
      ? {
          product_variants: product.product_variants.map((v) => ({
            ...v,
            price_modifier:
              Math.round(
                (grossPrice(Number(product.price) + Number(v.price_modifier ?? 0)) - base) * 100,
              ) / 100,
          })),
        }
      : {}),
  };
}
