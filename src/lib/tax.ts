// Germany-only, regular VAT; confirmed by the merchant on 14 October 2026.
// Catalogue storage remains NET. Customer-facing catalogue responses are GROSS.
export const VAT_RATE = 19;
export const SHIPPING_GROSS = 7.13; // EUR 5.99 net, rounded once.
export const grossPrice = (net: number) => Math.round(Number(net) * 119 + Number.EPSILON) / 100;
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
